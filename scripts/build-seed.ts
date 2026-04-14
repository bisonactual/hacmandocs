/**
 * Build-time script: reads markdown files from seed/docs/ and outputs
 * a JSON manifest that the worker can import directly.
 *
 * Usage: npx tsx scripts/build-seed.ts
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "seed", "docs");
const OUT_FILE = join(__dirname, "..", "packages", "worker", "src", "seed-data.json");

async function collectMarkdown(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".md")) {
        const rel = relative(SEED_DIR, full);
        files[rel] = await readFile(full, "utf-8");
      }
    }
  }

  await walk(dir);
  return files;
}

async function main() {
  const files = await collectMarkdown(SEED_DIR);
  const count = Object.keys(files).length;

  if (count === 0) {
    console.error("No .md files found in seed/docs/");
    process.exit(1);
  }

  await writeFile(OUT_FILE, JSON.stringify(files, null, 2), "utf-8");
  console.log(`Wrote ${count} files to ${OUT_FILE}`);
}

main();
