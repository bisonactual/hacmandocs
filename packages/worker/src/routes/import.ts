import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireAdminOrManager } from "../middleware/rbac";
import { documents, categories } from "../db/schema";
import {
  parseMarkdownWithWarnings,
  type DocumentNode,
  type ImportReport,
} from "@hacmandocs/shared";

function extractPlainText(node: DocumentNode): string {
  if (node.text) return node.text;
  if (node.content) return node.content.map(extractPlainText).join(" ");
  return "";
}

/**
 * Pre-process raw Markdown before parsing:
 * - Replace Jinja template variables {{ ... }} with placeholder text
 * - Strip frontmatter (--- blocks at the start)
 */
function preprocessMarkdown(raw: string): string {
  let content = raw;

  // Strip YAML frontmatter
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3);
    if (endIdx !== -1) {
      content = content.slice(endIdx + 3).trimStart();
    }
  }

  // Replace {{ variable }} with a readable placeholder
  content = content.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, varName: string) => {
    const name = varName.trim().split(".").pop() ?? varName.trim();
    // Convert snake_case to readable: broken_equipment_form → "broken equipment form"
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
  // Use filename without extension as fallback
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.md$/i, "");
}

export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  subpath: string;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    const owner = parts[0];
    const repo = parts[1];
    let branch = "main";
    let subpath = "";
    if (parts.length >= 4 && parts[2] === "tree") {
      branch = parts[3];
      if (parts.length > 4) subpath = parts.slice(4).join("/");
    }
    return { owner, repo, branch, subpath };
  } catch {
    return null;
  }
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxAttempts = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.ok) return resp;
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        const body = await resp.text().catch(() => "");
        throw new Error(`GitHub API ${resp.status}: ${body.slice(0, 200)}`);
      }
      lastError = new Error(`GitHub API error: ${resp.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  throw lastError ?? new Error("Fetch failed after retries");
}

/**
 * Build categories from folder paths in the file list.
 * Returns a map of folder path → category ID.
 * Creates nested categories matching the folder hierarchy.
 */
async function buildCategoriesFromPaths(
  db: ReturnType<typeof drizzle>,
  filePaths: string[],
  stripPrefix: string,
): Promise<Map<string, string>> {
  const pathToCategoryId = new Map<string, string>();
  const now = Math.floor(Date.now() / 1000);
  let sortOrder = 0;

  // Collect all unique folder paths
  const folderPaths = new Set<string>();
  for (const fp of filePaths) {
    let relative = fp;
    if (stripPrefix && relative.startsWith(stripPrefix)) {
      relative = relative.slice(stripPrefix.length);
      if (relative.startsWith("/")) relative = relative.slice(1);
    }
    const parts = relative.split("/");
    // Build each level: "a", "a/b", "a/b/c"
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join("/"));
    }
  }

  // Sort so parents come before children
  const sorted = [...folderPaths].sort();

  // Check existing categories by name to avoid duplicates
  const existingCats = await db.select().from(categories);
  const nameToId = new Map<string, string>();
  for (const cat of existingCats) {
    nameToId.set(`${cat.parentId ?? "root"}/${cat.name}`, cat.id);
  }

  for (const folderPath of sorted) {
    const parts = folderPath.split("/");
    const rawName = parts[parts.length - 1];
    // Strip leading numeric prefix (e.g. "0 Door Access" -> "Door Access")
    const prefixMatch = rawName.match(/^(\d+)\s+(.+)$/);
    const name = prefixMatch ? prefixMatch[2] : rawName;
    const parsedOrder = prefixMatch ? parseInt(prefixMatch[1], 10) : sortOrder++;
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const parentId = parentPath ? pathToCategoryId.get(parentPath) ?? null : null;

    // Check if this category already exists
    const lookupKey = `${parentId ?? "root"}/${name}`;
    if (nameToId.has(lookupKey)) {
      pathToCategoryId.set(folderPath, nameToId.get(lookupKey)!);
      continue;
    }

    const id = crypto.randomUUID();
    await db.insert(categories).values({
      id,
      name,
      parentId,
      sortOrder: prefixMatch ? parsedOrder : sortOrder,
      createdAt: now,
    });

    pathToCategoryId.set(folderPath, id);
    nameToId.set(lookupKey, id);
  }

  return pathToCategoryId;
}

/**
 * Get the category ID for a file based on its folder path.
 */
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
  if (parts.length <= 1) return null; // file at root level
  const folderPath = parts.slice(0, -1).join("/");
  return pathToCategoryId.get(folderPath) ?? null;
}

async function importMarkdownContent(
  db: ReturnType<typeof drizzle>,
  rawDb: D1Database,
  userId: string,
  filePath: string,
  rawContent: string,
  categoryId: string | null,
  report: ImportReport,
): Promise<void> {
  const processed = preprocessMarkdown(rawContent);
  const { doc, warnings } = parseMarkdownWithWarnings(processed, filePath);
  if (warnings.length > 0) {
    report.warnings.push(...warnings);
  }

  const id = crypto.randomUUID();
  const title = extractTitle(doc, filePath);
  const contentJsonStr = JSON.stringify(doc);
  const contentText = extractPlainText(doc);
  const now = Math.floor(Date.now() / 1000);

  await db.insert(documents).values({
    id,
    title,
    contentJson: contentJsonStr,
    categoryId,
    isSensitive: 0,
    isPublished: 1,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await rawDb
    .prepare(
      "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
    )
    .bind(id, title, contentText)
    .run();

  report.importedCount++;
}

interface GitHubTreeItem { path: string; type: string; sha: string; url: string; }
interface GitHubTreeResponse { tree: GitHubTreeItem[]; truncated: boolean; }
interface GitHubContentResponse { content: string; encoding: string; }

const importApp = new Hono<Env>();

importApp.post("/", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{
    repoUrl?: string;
    githubToken?: string;
    branch?: string;
    subpath?: string;
  }>();

  if (!body.repoUrl) return c.json({ error: "repoUrl is required" }, 400);

  const parsed = parseGitHubUrl(body.repoUrl);
  if (!parsed) return c.json({ error: "Invalid repository URL." }, 400);

  const { owner, repo } = parsed;
  const branch = body.branch ?? parsed.branch;
  const subpath = body.subpath ?? parsed.subpath;
  const session = c.get("session");

  const token = body.githubToken ?? c.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "hacmandocs-import",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let tree: GitHubTreeItem[];
  try {
    const treeResp = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      headers,
    );
    const treeData = (await treeResp.json()) as GitHubTreeResponse;
    tree = treeData.tree;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to list repository files: ${reason}` }, 502);
  }

  let mdFiles = tree.filter((item) => item.type === "blob" && item.path.endsWith(".md"));
  const prefix = subpath ? (subpath.endsWith("/") ? subpath : subpath + "/") : "";
  if (prefix) mdFiles = mdFiles.filter((item) => item.path.startsWith(prefix));

  const report: ImportReport = { totalFiles: mdFiles.length, importedCount: 0, failures: [], warnings: [] };
  if (mdFiles.length === 0) return c.json(report);

  const db = drizzle(c.env.DB);

  // Build categories from folder structure
  const pathToCategoryId = await buildCategoriesFromPaths(
    db,
    mdFiles.map((f) => f.path),
    prefix,
  );

  for (const file of mdFiles) {
    try {
      const contentResp = await fetchWithRetry(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`,
        headers,
      );
      const contentData = (await contentResp.json()) as GitHubContentResponse;
      if (contentData.encoding !== "base64" || !contentData.content) {
        report.failures.push({ filePath: file.path, reason: "Unexpected encoding" });
        continue;
      }
      const rawContent = atob(contentData.content.replace(/\n/g, ""));
      const categoryId = getCategoryForFile(file.path, prefix, pathToCategoryId);
      await importMarkdownContent(db, c.env.DB, session.userId, file.path, rawContent, categoryId, report);
    } catch (err) {
      report.failures.push({ filePath: file.path, reason: err instanceof Error ? err.message : "Failed" });
    }
  }

  return c.json(report);
});

importApp.post("/zip", requireAdminOrManager(), async (c) => {
  const session = c.get("session");
  const formData = await c.req.formData();
  const rawFile = formData.get("file");
  if (!rawFile || typeof rawFile === "string") return c.json({ error: "A ZIP file is required" }, 400);
  const file = rawFile as unknown as { arrayBuffer(): Promise<ArrayBuffer> };

  const { unzipSync } = await import("fflate");
  const zipData = new Uint8Array(await file.arrayBuffer());

  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(zipData); } catch { return c.json({ error: "Failed to decompress ZIP" }, 400); }

  const mdPaths = Object.keys(entries).filter((p) => p.endsWith(".md") && !p.startsWith("__MACOSX"));
  const report: ImportReport = { totalFiles: mdPaths.length, importedCount: 0, failures: [], warnings: [] };
  if (mdPaths.length === 0) return c.json(report);

  const db = drizzle(c.env.DB);
  const decoder = new TextDecoder();

  // Strip common prefix (e.g. "repo-name-master/docs/")
  const commonPrefix = findCommonPrefix(mdPaths);

  // Build categories from folder structure
  const pathToCategoryId = await buildCategoriesFromPaths(db, mdPaths, commonPrefix);

  for (const filePath of mdPaths) {
    try {
      const rawContent = decoder.decode(entries[filePath]);
      const categoryId = getCategoryForFile(filePath, commonPrefix, pathToCategoryId);
      await importMarkdownContent(db, c.env.DB, session.userId, filePath, rawContent, categoryId, report);
    } catch (err) {
      report.failures.push({ filePath, reason: err instanceof Error ? err.message : "Failed" });
    }
  }

  return c.json(report);
});

/**
 * Find the common directory prefix across all paths.
 * e.g. ["a/b/c.md", "a/b/d.md"] → "a/b"
 */
function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => {
    const parts = p.split("/");
    return parts.slice(0, -1); // remove filename
  });
  if (dirs.length === 0) return "";
  const first = dirs[0];
  let prefixLen = 0;
  for (let i = 0; i < first.length; i++) {
    if (dirs.every((d) => d[i] === first[i])) {
      prefixLen = i + 1;
    } else {
      break;
    }
  }
  return first.slice(0, prefixLen).join("/");
}

export default importApp;
