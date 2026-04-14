import { Hono } from "hono";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const imagesApp = new Hono<Env>();

/**
 * POST /upload — Upload an image to R2 (Admin only).
 * Accepts multipart/form-data with a "file" field.
 * Returns { url } pointing to the GET endpoint.
 */
imagesApp.post("/upload", requireRole("Admin"), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file provided." }, 400);
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: `Unsupported file type: ${file.type}` }, 400);
  }

  if (file.size > MAX_SIZE) {
    return c.json({ error: "File too large (max 5 MB)." }, 400);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `${crypto.randomUUID()}.${ext}`;

  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
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
