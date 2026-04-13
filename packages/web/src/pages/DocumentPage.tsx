import { useEffect, useState } from "react";
import { useParams, useNavigate, NavLink } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { DocumentNode } from "@hacmandocs/shared";

interface DocumentData {
  id: string;
  title: string;
  contentJson: string;
  categoryId: string | null;
  isSensitive: number;
  isPublished: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

interface CategoryData {
  id: string;
  name: string;
  parentId: string | null;
}

interface SiblingDoc {
  id: string;
  title: string;
  categoryId: string | null;
  isSensitive: number;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

// ── Admonition styles ────────────────────────────────────────────────

const ADMONITION_STYLES: Record<string, { border: string; bg: string; icon: string; titleBg: string; titleText: string }> = {
  tip:     { border: "border-emerald-300", bg: "bg-emerald-50",  icon: "💡", titleBg: "bg-emerald-100", titleText: "text-emerald-800" },
  note:    { border: "border-sky-300",     bg: "bg-sky-50",      icon: "📝", titleBg: "bg-sky-100",     titleText: "text-sky-800" },
  warning: { border: "border-amber-300",   bg: "bg-amber-50",    icon: "⚠️", titleBg: "bg-amber-100",   titleText: "text-amber-800" },
  danger:  { border: "border-rose-300",    bg: "bg-rose-50",     icon: "🔴", titleBg: "bg-rose-100",    titleText: "text-rose-800" },
  failure: { border: "border-rose-300",    bg: "bg-rose-50",     icon: "❌", titleBg: "bg-rose-100",    titleText: "text-rose-800" },
  info:    { border: "border-sky-300",     bg: "bg-sky-50",      icon: "ℹ️", titleBg: "bg-sky-100",     titleText: "text-sky-800" },
  success: { border: "border-emerald-300", bg: "bg-emerald-50",  icon: "✅", titleBg: "bg-emerald-100", titleText: "text-emerald-800" },
  example: { border: "border-violet-300",  bg: "bg-violet-50",   icon: "📋", titleBg: "bg-violet-100",  titleText: "text-violet-800" },
  quote:   { border: "border-gray-300",    bg: "bg-gray-50",     icon: "💬", titleBg: "bg-gray-100",    titleText: "text-gray-700" },
  bug:     { border: "border-pink-300",    bg: "bg-pink-50",     icon: "🐛", titleBg: "bg-pink-100",    titleText: "text-pink-800" },
  abstract:{ border: "border-teal-300",    bg: "bg-teal-50",     icon: "📄", titleBg: "bg-teal-100",    titleText: "text-teal-800" },
  question:{ border: "border-lime-300",    bg: "bg-lime-50",     icon: "❓", titleBg: "bg-lime-100",    titleText: "text-lime-800" },
};

function getAdmonitionStyle(type: string) {
  return ADMONITION_STYLES[type] ?? ADMONITION_STYLES.note;
}

// ── Extract plain text from a node ───────────────────────────────────

function extractText(node: DocumentNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

// ── Extract TOC from headings ────────────────────────────────────────

function extractToc(node: DocumentNode): TocEntry[] {
  const entries: TocEntry[] = [];
  if (!node.content) return entries;
  for (const child of node.content) {
    if (child.type === "heading") {
      const level = (child.attrs?.level as number) ?? 1;
      const text = extractText(child);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      entries.push({ id, text, level });
    }
  }
  return entries;
}

// ── Render ProseMirror JSON to React ─────────────────────────────────

function renderNode(node: DocumentNode, key: number | string): React.ReactNode {
  if (node.text) {
    let el: React.ReactNode = node.text;
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case "bold":
            el = <strong key={`${key}-b`}>{el}</strong>;
            break;
          case "italic":
            el = <em key={`${key}-i`}>{el}</em>;
            break;
          case "link":
            el = (
              <a key={`${key}-a`} href={mark.attrs?.href as string}
                className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                {el}
              </a>
            );
            break;
          case "code":
            el = <code key={`${key}-c`} className="rounded bg-gray-100 px-1 text-sm">{el}</code>;
            break;
        }
      }
    }
    return el;
  }

  const children = node.content?.map((child, i) => renderNode(child, `${key}-${i}`));

  switch (node.type) {
    case "doc":
      return <div key={key}>{children}</div>;
    case "paragraph":
      return <p key={key} className="mb-3 leading-relaxed">{children}</p>;
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const text = extractText(node);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const sizes: Record<number, string> = {
        1: "text-3xl font-bold mb-4 mt-6",
        2: "text-2xl font-semibold mb-3 mt-5",
        3: "text-xl font-semibold mb-2 mt-4",
        4: "text-lg font-medium mb-2 mt-3",
        5: "text-base font-medium mb-1 mt-2",
        6: "text-sm font-medium mb-1 mt-2",
      };
      const cls = sizes[level] ?? sizes[1];
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag key={key} id={id} className={cls}>{children}</Tag>;
    }
    case "admonition": {
      const adType = (node.attrs?.admonitionType as string) ?? "note";
      const adTitle = (node.attrs?.title as string) ?? adType;
      const style = getAdmonitionStyle(adType);
      return (
        <div key={key} className={`mb-4 overflow-hidden rounded border ${style.border}`}>
          <div className={`flex items-center gap-2 px-4 py-2 ${style.titleBg} ${style.titleText}`}>
            <span>{style.icon}</span>
            <span className="text-sm font-semibold">{adTitle}</span>
          </div>
          <div className={`px-4 py-3 text-sm ${style.bg} text-gray-700`}>{children}</div>
        </div>
      );
    }
    case "bulletList":
      return <ul key={key} className="mb-3 ml-6 list-disc">{children}</ul>;
    case "orderedList":
      return <ol key={key} className="mb-3 ml-6 list-decimal">{children}</ol>;
    case "listItem":
      return <li key={key} className="mb-1">{children}</li>;
    case "codeBlock":
      return (
        <pre key={key} className="mb-3 overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100">
          <code>{children}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="mb-3 border-l-4 border-gray-300 pl-4 italic text-gray-600">
          {children}
        </blockquote>
      );
    case "image":
      return (
        <img key={key} src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ""} className="mb-3 max-w-full rounded" />
      );
    case "table":
      return (
        <table key={key} className="mb-3 w-full border-collapse border border-gray-300">
          <tbody>{children}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key} className="border-b border-gray-200">{children}</tr>;
    case "tableCell":
      return <td key={key} className="border border-gray-300 px-3 py-2">{children}</td>;
    case "tableHeader":
      return <th key={key} className="border border-gray-300 bg-gray-50 px-3 py-2 font-semibold">{children}</th>;
    case "horizontalRule":
      return <hr key={key} className="my-4 border-gray-300" />;
    default:
      return <div key={key}>{children}</div>;
  }
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ── Table of Contents component ──────────────────────────────────────

function TableOfContents({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;
  const minLevel = Math.min(...entries.map((e) => e.level));

  return (
    <nav className="sticky top-6" aria-label="Table of contents">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        On this page
      </h3>
      <ul className="space-y-1 text-sm">
        {entries.map((entry) => (
          <li key={entry.id} style={{ paddingLeft: `${(entry.level - minLevel) * 12}px` }}>
            <a
              href={`#${entry.id}`}
              className="block truncate text-gray-500 hover:text-blue-600"
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Sibling docs sidebar ─────────────────────────────────────────────

function SiblingDocs({ docs, currentId }: { docs: SiblingDoc[]; currentId: string }) {
  if (docs.length <= 1) return null;

  return (
    <nav aria-label="Related documents">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        In this category
      </h3>
      <ul className="space-y-0.5 text-sm">
        {docs.map((d) => (
          <li key={d.id}>
            <NavLink
              to={`/documents/${d.id}`}
              className={
                d.id === currentId
                  ? "block truncate rounded bg-blue-50 px-2 py-1 font-medium text-blue-700"
                  : "block truncate rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
              }
            >
              {d.isSensitive === 1 && <span className="mr-1 text-amber-500">🔒</span>}
              {d.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [category, setCategory] = useState<CategoryData | null>(null);
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [siblingDocs, setSiblingDocs] = useState<SiblingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    apiFetch<DocumentData>(`/api/documents/${id}`)
      .then(async (d) => {
        setDoc(d);
        try {
          const [cats, allDocs] = await Promise.all([
            apiFetch<CategoryData[]>("/api/categories"),
            apiFetch<SiblingDoc[]>("/api/documents"),
          ]);
          setAllCategories(cats);
          if (d.categoryId) {
            const cat = cats.find((c) => c.id === d.categoryId);
            if (cat) setCategory(cat);
            // Get sibling docs in the same category
            setSiblingDocs(allDocs.filter((doc) => doc.categoryId === d.categoryId));
          } else {
            // Uncategorized siblings
            setSiblingDocs(allDocs.filter((doc) => !doc.categoryId));
          }
        } catch {
          // non-critical
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-6 text-gray-400">Loading document…</p>;

  if (error || !doc) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">{error ?? "Document not found"}</p>
        <button type="button" onClick={() => navigate("/")}
          className="mt-2 text-sm text-blue-600 underline">Go back</button>
      </div>
    );
  }

  const content: DocumentNode = JSON.parse(doc.contentJson);
  const toc = extractToc(content);
  const canPropose = user && ["Editor", "Approver", "Admin"].includes(user.permissionLevel);

  return (
    <div className="flex gap-6">
      {/* Left: sibling docs */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <SiblingDocs docs={siblingDocs} currentId={doc.id} />
      </aside>

      {/* Center: document content */}
      <article className="min-w-0 flex-1">
        <header className="mb-6 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-2">
            {doc.isSensitive === 1 && (
              <span className="text-amber-500" title="Sensitive document">🔒</span>
            )}
            <h1 className="text-3xl font-bold text-gray-900">{doc.title}</h1>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
            {user?.permissionLevel === "Admin" ? (
              <span className="flex items-center gap-1">
                Category:
                <select
                  value={doc.categoryId ?? ""}
                  onChange={async (e) => {
                    const newCatId = e.target.value || null;
                    await apiFetch(`/api/documents/${id}`, {
                      method: "PUT",
                      body: JSON.stringify({ categoryId: newCatId }),
                    });
                    setDoc((d) => d ? { ...d, categoryId: newCatId } : d);
                    setCategory(allCategories.find((c) => c.id === newCatId) ?? null);
                  }}
                  className="rounded border border-gray-300 px-2 py-0.5 text-sm"
                >
                  <option value="">Uncategorized</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </span>
            ) : (
              category && <span>Category: {category.name}</span>
            )}
            <span>Last modified: {formatDate(doc.updatedAt)}</span>
          </div>
          {canPropose && (
            <button type="button" onClick={() => navigate(`/documents/${id}/propose`)}
              className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
              Propose Edit
            </button>
          )}
        </header>

        <div className="prose max-w-none text-gray-800">
          {renderNode(content, "root")}
        </div>
      </article>

      {/* Right: table of contents */}
      <aside className="hidden w-52 shrink-0 xl:block">
        <TableOfContents entries={toc} />
      </aside>
    </div>
  );
}
