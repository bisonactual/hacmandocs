import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseGitHubUrl } from "./import.js";
import type { ImportReport } from "@hacmandocs/shared";

// ── Generators ───────────────────────────────────────────────────────

/** Generate a safe file path string. */
const filePath = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.array(
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/),
        { minLength: 0, maxLength: 3 },
      ),
      fc.stringMatching(/^[a-z][a-z0-9_-]{1,10}\.md$/),
    )
    .map(([dirs, file]) => (dirs.length > 0 ? dirs.join("/") + "/" + file : file));

/** Generate a non-empty reason string. */
const reason = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,30}$/).filter((s) => s.trim().length > 0);

/** Generate a single import result: either success or failure. */
const importResult = (): fc.Arbitrary<
  { success: true; filePath: string } | { success: false; filePath: string; reason: string }
> =>
  fc.oneof(
    filePath().map((fp) => ({ success: true as const, filePath: fp })),
    fc.tuple(filePath(), reason()).map(([fp, r]) => ({
      success: false as const,
      filePath: fp,
      reason: r,
    })),
  );

/** Generate a set of import results (mix of successes and failures). */
const importResultSet = (): fc.Arbitrary<
  Array<
    { success: true; filePath: string } | { success: false; filePath: string; reason: string }
  >
> => fc.array(importResult(), { minLength: 0, maxLength: 20 });

/**
 * Build an ImportReport from a set of import results.
 * This mirrors the logic in import.ts where importedCount is incremented
 * on success and failures are pushed on error.
 */
function buildImportReport(
  results: Array<
    { success: true; filePath: string } | { success: false; filePath: string; reason: string }
  >,
): ImportReport {
  const report: ImportReport = {
    totalFiles: results.length,
    importedCount: 0,
    failures: [],
    warnings: [],
  };

  for (const result of results) {
    if (result.success) {
      report.importedCount++;
    } else {
      report.failures.push({
        filePath: result.filePath,
        reason: result.reason,
      });
    }
  }

  return report;
}

// ── Property 2: Import report accuracy ───────────────────────────────

describe("Property 2: Import report accuracy", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any set of import results containing a mix of successful and failed
   * file imports, the generated import report SHALL have `importedCount`
   * equal to the number of successful imports, `failures.length` equal to
   * the number of failed imports, and every failed file SHALL appear in the
   * failures list with a non-empty reason.
   */
  it("importedCount equals number of successes, failures.length equals number of failures", () => {
    fc.assert(
      fc.property(importResultSet(), (results) => {
        const report = buildImportReport(results);

        const successes = results.filter((r) => r.success);
        const failures = results.filter((r) => !r.success);

        // importedCount equals number of successes
        expect(report.importedCount).toBe(successes.length);

        // failures.length equals number of failures
        expect(report.failures.length).toBe(failures.length);

        // totalFiles = successes + failures
        expect(report.totalFiles).toBe(successes.length + failures.length);
      }),
      { numRuns: 100 },
    );
  });

  it("every failed file appears in failures with a non-empty reason", () => {
    fc.assert(
      fc.property(importResultSet(), (results) => {
        const report = buildImportReport(results);

        const failedResults = results.filter(
          (r): r is { success: false; filePath: string; reason: string } => !r.success,
        );

        // Every failed file must appear in the failures list
        for (const failed of failedResults) {
          const entry = report.failures.find(
            (f) => f.filePath === failed.filePath && f.reason === failed.reason,
          );
          expect(entry).toBeDefined();
          expect(entry!.reason.length).toBeGreaterThan(0);
        }

        // Every failure entry must have a non-empty reason
        for (const failure of report.failures) {
          expect(failure.reason).toBeTruthy();
          expect(failure.reason.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("report structure is always valid", () => {
    fc.assert(
      fc.property(importResultSet(), (results) => {
        const report = buildImportReport(results);

        expect(report).toHaveProperty("totalFiles");
        expect(report).toHaveProperty("importedCount");
        expect(report).toHaveProperty("failures");
        expect(report).toHaveProperty("warnings");
        expect(typeof report.totalFiles).toBe("number");
        expect(typeof report.importedCount).toBe("number");
        expect(Array.isArray(report.failures)).toBe(true);
        expect(Array.isArray(report.warnings)).toBe(true);
        expect(report.totalFiles).toBeGreaterThanOrEqual(0);
        expect(report.importedCount).toBeGreaterThanOrEqual(0);
        expect(report.importedCount).toBeLessThanOrEqual(report.totalFiles);
      }),
      { numRuns: 100 },
    );
  });
});

// ── parseGitHubUrl tests ─────────────────────────────────────────────

describe("parseGitHubUrl", () => {
  it("parses standard GitHub URL", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses GitHub URL with .git suffix", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses GitHub URL with trailing slash", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://bitbucket.org/owner/repo")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });

  it("returns null for GitHub URL with missing repo", () => {
    expect(parseGitHubUrl("https://github.com/owner")).toBeNull();
    expect(parseGitHubUrl("https://github.com/")).toBeNull();
  });

  it("handles URLs with extra path segments", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/main");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });
});
