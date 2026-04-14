import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { documents, categories } from "../db/schema";
import {
  parseMarkdownWithWarnings,
  type DocumentNode,
  type ImportReport,
} from "@hacmandocs/shared";

// Bundled at build time by the build-seed script
import seedData from "../seed-data.json";

function extractPlainText(node: DocumentNode): string {
  if (node.text) return node.text;
  if (node.content) return node.content.map(extractPlainText).join(" ");
  return "";
}

function preprocessMarkdown(raw: string): string {
  let content = raw;
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3);
    if (endIdx !== -1) content = content.slice(endIdx + 3).trimStart();
  }
  content = content.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, varName: string) => {
    const name = varName.trim().split(".").pop() ?? varName.trim();
    return `[${name.replace(/_/g, " ")}]`;
  });
  return content;
}

function extractTitle(doc: DocumentNode, filePath: string): string {
  if (doc.content) {
    for (const child of doc.content) {
      if (child.type === "heading" && child.content) {
        const text = extractPlainText(child);
        if (text.trim()) return text.trim();
      }
    }
  }
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.md$/i, "");
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  if (dirs.length === 0) return "";
  const first = dirs[0];
  let prefixLen = 0;
  for (let i = 0; i < first.length; i++) {
    if (dirs.every((d) => d[i] === first[i])) prefixLen = i + 1;
    else break;
  }
  return first.slice(0, prefixLen).join("/");
}

async function buildCategoriesFromPaths(
  db: ReturnType<typeof drizzle>,
  filePaths: string[],
  stripPrefix: string,
): Promise<Map<string, string>> {
  const pathToCategoryId = new Map<string, string>();
  const now = Math.floor(Date.now() / 1000);
  let sortOrder = 0;

  const folderPaths = new Set<string>();
  for (const fp of filePaths) {
    let relative = fp;
    if (stripPrefix && relative.startsWith(stripPrefix)) {
      relative = relative.slice(stripPrefix.length);
      if (relative.startsWith("/")) relative = relative.slice(1);
    }
    const parts = relative.split("/");
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join("/"));
    }
  }

  const sorted = [...folderPaths].sort();
  const existingCats = await db.select().from(categories);
  const nameToId = new Map<string, string>();
  for (const cat of existingCats) {
    nameToId.set(`${cat.parentId ?? "root"}/${cat.name}`, cat.id);
  }

  for (const folderPath of sorted) {
    const parts = folderPath.split("/");
    const rawName = parts[parts.length - 1];
    const prefixMatch = rawName.match(/^(\d+)\s+(.+)$/);
    const name = prefixMatch ? prefixMatch[2] : rawName;
    const parsedOrder = prefixMatch ? parseInt(prefixMatch[1], 10) : sortOrder++;
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const parentId = parentPath ? pathToCategoryId.get(parentPath) ?? null : null;

    const lookupKey = `${parentId ?? "root"}/${name}`;
    if (nameToId.has(lookupKey)) {
      pathToCategoryId.set(folderPath, nameToId.get(lookupKey)!);
      continue;
    }

    const id = crypto.randomUUID();
    await db.insert(categories).values({
      id, name, parentId,
      sortOrder: prefixMatch ? parsedOrder : sortOrder,
      createdAt: now,
    });
    pathToCategoryId.set(folderPath, id);
    nameToId.set(lookupKey, id);
  }

  return pathToCategoryId;
}

function getCategoryForFile(
  filePath: string,
  stripPrefix: string,
  pathToCategoryId: Map<string, string>,
): string | null {
  let relative = filePath;
  if (stripPrefix && relative.startsWith(stripPrefix)) {
    relative = relative.slice(stripPrefix.length);
    if (relative.startsWith("/")) relative = relative.slice(1);
  }
  const parts = relative.split("/");
  if (parts.length <= 1) return null;
  return pathToCategoryId.get(parts.slice(0, -1).join("/")) ?? null;
}

const seedApp = new Hono<Env>();

seedApp.post("/", requireRole("Admin"), async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);
  const files = seedData as Record<string, string>;
  const mdPaths = Object.keys(files);

  // Check if already seeded
  const existing = await db.select({ count: sql<number>`count(*)` }).from(documents);
  if (existing[0].count > 0) {
    return c.json({ error: "Database already has documents. Clear them first or skip seeding." }, 409);
  }

  const report: ImportReport = { totalFiles: mdPaths.length, importedCount: 0, failures: [], warnings: [] };
  if (mdPaths.length === 0) return c.json(report);

  const commonPrefix = findCommonPrefix(mdPaths);
  const pathToCategoryId = await buildCategoriesFromPaths(db, mdPaths, commonPrefix);

  for (const filePath of mdPaths) {
    try {
      const rawContent = files[filePath];
      const processed = preprocessMarkdown(rawContent);
      const { doc, warnings } = parseMarkdownWithWarnings(processed, filePath);
      if (warnings.length > 0) report.warnings.push(...warnings);

      const id = crypto.randomUUID();
      const title = extractTitle(doc, filePath);
      const contentJsonStr = JSON.stringify(doc);
      const contentText = extractPlainText(doc);
      const now = Math.floor(Date.now() / 1000);

      await db.insert(documents).values({
        id, title, contentJson: contentJsonStr, categoryId: getCategoryForFile(filePath, commonPrefix, pathToCategoryId),
        isSensitive: 0, isPublished: 1, createdBy: session.userId, createdAt: now, updatedAt: now,
      });

      await c.env.DB.prepare(
        "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
      ).bind(id, title, contentText).run();

      report.importedCount++;
    } catch (err) {
      report.failures.push({ filePath, reason: err instanceof Error ? err.message : "Failed" });
    }
  }

  return c.json(report);
});

export default seedApp;
