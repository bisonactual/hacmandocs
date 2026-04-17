import { Hono } from "hono";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;  // 50 MB

const imagesApp = new Hono<Env>();

/**
 * POST /upload — Upload an image to R2 (Admin only).
 * Accepts multipart/form-data with a "file" field.
 * Returns { url } pointing to the GET endpoint.
 */
imagesApp.post("/upload", requireRole("Admin"), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return c.json({ error: "No file provided." }, 400);
  }

  // In Workers, formData files come as File objects but the CF types
  // don't include File in the FormData return type. Cast via unknown.
  const f = file as unknown as File;

  if (!ALLOWED_TYPES.includes(f.type)) {
    return c.json({ error: `Unsupported file type: ${f.type}` }, 400);
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(f.type);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (f.size > maxSize) {
    return c.json({ error: `File too large (max ${isVideo ? "50" : "5"} MB).` }, 400);
  }

  const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `${crypto.randomUUID()}.${ext}`;

  await c.env.IMAGES.put(key, f.stream(), {
    httpMetadata: { contentType: f.type },
  });

  // Return a relative URL; the GET route below serves the image
  return c.json({ url: `/api/images/${key}` }, 201);
});

/**
 * GET /:key — Serve an image from R2 (public, no auth required).
 */
imagesApp.get("/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.IMAGES.get(key);

  if (!object) {
    return c.json({ error: "Image not found." }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

/**
 * DELETE /:key — Delete an image from R2 (Admin only).
 */
imagesApp.delete("/:key", requireRole("Admin"), async (c) => {
  const key = c.req.param("key");
  await c.env.IMAGES.delete(key);
  return c.json({ success: true });
});

export default imagesApp;
