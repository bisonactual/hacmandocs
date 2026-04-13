import type { DocumentNode } from "@hacmandocs/shared";

/** Extract plain text from a ProseMirror JSON node for diff display. */
function extractText(node: DocumentNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

/** Flatten a document into lines of text for side-by-side comparison. */
function flattenToLines(node: DocumentNode): string[] {
  if (!node.content) return [extractText(node)];
  return node.content.map((child) => extractText(child));
}

interface ProposalDiffViewProps {
  before: DocumentNode;
  after: DocumentNode;
}

export default function ProposalDiffView({ before, after }: ProposalDiffViewProps) {
  const beforeLines = flattenToLines(before);
  const afterLines = flattenToLines(after);
  const maxLen = Math.max(beforeLines.length, afterLines.length);

  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded border border-gray-300">
      {/* Header */}
      <div className="border-b border-r border-gray-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
        Current Version
      </div>
      <div className="border-b border-gray-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
        Proposed Changes
      </div>

      {/* Lines */}
      {Array.from({ length: maxLen }, (_, i) => {
        const left = beforeLines[i] ?? "";
        const right = afterLines[i] ?? "";
        const changed = left !== right;

        return (
          <div key={i} className="contents">
            <div
              className={`border-b border-r border-gray-200 px-3 py-1 text-sm ${
                changed ? "bg-red-50 text-red-800" : "text-gray-700"
              }`}
            >
              {left || <span className="text-gray-300">—</span>}
            </div>
            <div
              className={`border-b border-gray-200 px-3 py-1 text-sm ${
                changed ? "bg-green-50 text-green-800" : "text-gray-700"
              }`}
            >
              {right || <span className="text-gray-300">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
