import { useEffect, useState } from "react";
import { useParams, useNavigate, NavLink, Link } from "react-router-dom";
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

interface LinkedTool {
  id: string;
  name: string;
  docPageId: string | null;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const ADMONITION_STYLES: Record<string, { border: string; bg: string; icon: string; titleBg: string; titleText: string }> = {
  tip:     { border: "border-emerald-500/30", bg: "bg-emerald-500/5",  icon: "💡", titleBg: "bg-emerald-500/10", titleText: "text-emerald-400" },
  note:    { border: "border-sky-500/30",     bg: "bg-sky-500/5",      icon: "📝", titleBg: "bg-sky-500/10",     titleText: "text-sky-400" },
  warning: { border: "border-amber-500/30",   bg: "bg-amber-500/5",    icon: "⚠️", titleBg: "bg-amber-500/10",   titleText: "text-amber-400" },
  danger:  { border: "border-rose-500/30",    bg: "bg-rose-500/5",     icon: "🔴", titleBg: "bg-rose-500/10",    titleText: "text-rose-400" },
  failure: { border: "border-rose-500/30",    bg: "bg-rose-500/5",     icon: "❌", titleBg: "bg-rose-500/10",    titleText: "text-rose-400" },
  info:    { border: "border-sky-500/30",     bg: "bg-sky-500/5",      icon: "ℹ️", titleBg: "bg-sky-500/10",     titleText: "text-sky-400" },
  success: { border: "border-emerald-500/30", bg: "bg-emerald-500/5",  icon: "✅", titleBg: "bg-emerald-500/10", titleText: "text-emerald-400" },
  example: { border: "border-violet-500/30",  bg: "bg-violet-500/5",   icon: "📋", titleBg: "bg-violet-500/10",  titleText: "text-violet-400" },
  quote:   { border: "border-gray-500/30",    bg: "bg-gray-500/5",     icon: "💬", titleBg: "bg-gray-500/10",    titleText: "text-gray-400" },
  bug:     { border: "border-pink-500/30",    bg: "bg-pink-500/5",     icon: "🐛", titleBg: "bg-pink-500/10",    titleText: "text-pink-400" },
  abstract:{ border: "border-teal-500/30",    bg: "bg-teal-500/5",     icon: "📄", titleBg: "bg-teal-500/10",    titleText: "text-teal-400" },
  question:{ border: "border-lime-500/30",    bg: "bg-lime-500/5",     icon: "❓", titleBg: "bg-lime-500/10",    titleText: "text-lime-400" },
};

function getAdmonitionStyle(type: string) {
  return ADMONITION_STYLES[type] ?? ADMONITION_STYLES.note;
}

function extractText(node: DocumentNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

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
                className="text-hacman-yellow underline hover:text-hacman-yellow-dark" target="_blank" rel="noopener noreferrer">
                {el}
              </a>
            );
            break;
          case "code":
            el = <code key={`${key}-c`} className="rounded bg-hacman-gray px-1.5 py-0.5 text-sm text-gray-300">{el}</code>;
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
      return <p key={key} className="mb-3 leading-relaxed text-gray-300">{children}</p>;
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const text = extractText(node);
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const sizes: Record<number, string> = {
        1: "text-3xl font-bold mb-4 mt-6 text-white",
        2: "text-2xl font-semibold mb-3 mt-5 text-white",
        3: "text-xl font-semibold mb-2 mt-4 text-gray-200",
        4: "text-lg font-medium mb-2 mt-3 text-gray-200",
        5: "text-base font-medium mb-1 mt-2 text-gray-300",
        6: "text-sm font-medium mb-1 mt-2 text-gray-300",
      };
      const cls = sizes[level] ?? sizes[1];
      const Tag = `h${level}` as React.ElementType;
      return <Tag key={key} id={id} className={cls}>{children}</Tag>;
    }
    case "admonition": {
      const adType = (node.attrs?.admonitionType as string) ?? "note";
      const adTitle = (node.attrs?.title as string) ?? adType;
      const style = getAdmonitionStyle(adType);
      return (
        <div key={key} className={`mb-4 overflow-hidden rounded-lg border ${style.border}`}>
          <div className={`flex items-center gap-2 px-4 py-2 ${style.titleBg} ${style.titleText}`}>
            <span>{style.icon}</span>
            <span className="text-sm font-semibold">{adTitle}</span>
          </div>
          <div className={`px-4 py-3 text-sm ${style.bg} text-gray-300`}>{children}</div>
        </div>
      );
    }
    case "bulletList":
      return <ul key={key} className="mb-3 ml-6 list-disc text-gray-300">{children}</ul>;
    case "orderedList":
      return <ol key={key} className="mb-3 ml-6 list-decimal text-gray-300">{children}</ol>;
    case "listItem":
      return <li key={key} className="mb-1">{children}</li>;
    case "codeBlock":
      return (
        <pre key={key} className="mb-3 overflow-x-auto rounded-lg bg-hacman-black border border-hacman-gray p-4 text-sm text-gray-200">
          <code>{children}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="mb-3 border-l-4 border-hacman-yellow/40 pl-4 italic text-gray-400">
          {children}
        </blockquote>
      );
    case "image":
      return (
        <img key={key} src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ""} className="mb-3 max-w-full rounded-lg" />
      );
    case "table":
      return (
        <table key={key} className="mb-3 w-full border-collapse border border-hacman-gray">
          <tbody>{children}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key} className="border-b border-hacman-gray">{children}</tr>;
    case "tableCell":
      return <td key={key} className="border border-hacman-gray px-3 py-2 text-gray-300">{children}</td>;
    case "tableHeader":
      return <th key={key} className="border border-hacman-gray bg-hacman-gray/50 px-3 py-2 font-semibold text-gray-200">{children}</th>;
    case "horizontalRule":
      return <hr key={key} className="my-4 border-hacman-gray" />;
    case "trainingLink":
      return null;
    default:
      return <div key={key}>{children}</div>;
  }
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

function TableOfContents({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;
  const minLevel = Math.min(...entries.map((e) => e.level));

  return (
    <nav className="sticky top-6" aria-label="Table of contents">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-hacman-muted">
        On this page
      </h3>
      <ul className="space-y-1 text-sm">
        {entries.map((entry) => (
          <li key={entry.id} style={{ paddingLeft: `${(entry.level - minLevel) * 12}px` }}>
            <a href={`#${entry.id}`} className="block truncate text-gray-500 hover:text-hacman-yellow transition-colors">
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SiblingDocs({ docs, currentId }: { docs: SiblingDoc[]; currentId: string }) {
  if (docs.length <= 1) return null;

  return (
    <nav aria-label="Related documents">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-hacman-muted">
        In this category
      </h3>
      <ul className="space-y-0.5 text-sm">
        {docs.map((d) => (
          <li key={d.id}>
            <NavLink
              to={`/documents/${d.id}`}
              className={
                d.id === currentId
                  ? "block truncate rounded-md bg-hacman-yellow/10 px-2 py-1 font-medium text-hacman-yellow"
                  : "block truncate rounded-md px-2 py-1 text-gray-400 hover:bg-hacman-gray hover:text-gray-200 transition-colors"
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

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [category, setCategory] = useState<CategoryData | null>(null);
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [siblingDocs, setSiblingDocs] = useState<SiblingDoc[]>([]);
  const [linkedTool, setLinkedTool] = useState<LinkedTool | null>(null);
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
          const [cats, allDocs, tools] = await Promise.all([
            apiFetch<CategoryData[]>("/api/categories"),
            apiFetch<SiblingDoc[]>("/api/documents"),
            apiFetch<LinkedTool[]>("/api/inductions/tools").catch(() => []),
          ]);
          setAllCategories(cats);
          if (d.categoryId) {
            const cat = cats.find((c) => c.id === d.categoryId);
            if (cat) setCategory(cat);
            setSiblingDocs(allDocs.filter((doc) => doc.categoryId === d.categoryId));
          } else {
            setSiblingDocs(allDocs.filter((doc) => !doc.categoryId));
          }
          const match = tools.find((t) => t.docPageId === d.id);
          if (match) setLinkedTool(match);
        } catch {
          // non-critical
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );

  if (error || !doc) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error ?? "Document not found"}</p>
        <button type="button" onClick={() => navigate("/")}
          className="mt-2 text-sm text-hacman-yellow underline">Go back</button>
      </div>
    );
  }

  const content: DocumentNode = JSON.parse(doc.contentJson);
  const toc = extractToc(content);
  const canPropose = !!user;
  const isAdmin = user?.permissionLevel === "Admin";
  const isUnpublished = doc.isPublished === 0;

  const handlePublish = async () => {
    await apiFetch(`/api/documents/${id}/publish`, {
      method: "PUT",
      body: JSON.stringify({ published: true }),
    });
    setDoc((d) => d ? { ...d, isPublished: 1 } : d);
  };

  return (
    <div className="flex gap-6">
      {/* Left: sibling docs */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <SiblingDocs docs={siblingDocs} currentId={doc.id} />
      </aside>

      {/* Center: document content */}
      <article className="min-w-0 flex-1" data-print-area>
        <header className="mb-6 border-b border-hacman-gray pb-4">
          <div className="flex items-center gap-2">
            {doc.isSensitive === 1 && (
              <span className="text-amber-500" title="Sensitive document">🔒</span>
            )}
            <h1 className="text-3xl font-bold text-white">{doc.title}</h1>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-hacman-muted">
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
                  className="rounded-md border border-hacman-gray bg-hacman-black px-2 py-0.5 text-sm text-gray-300"
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
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => navigate(`/documents/${id}/propose`)}
                className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors">
                Propose Edit
              </button>
              <button type="button" onClick={() => navigate(`/documents/${id}/propose-delete`)}
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                {isAdmin || user?.permissionLevel === "Approver" ? "Delete" : "Propose Delete"}
              </button>
              {isAdmin && isUnpublished && (
                <button type="button" onClick={handlePublish}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                  Publish
                </button>
              )}
              {isUnpublished && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400 border border-amber-500/30">
                  Unpublished
                </span>
              )}
            </div>
          )}
        </header>

        {linkedTool && (
          <div className="my-4 rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-hacman-muted mb-0.5">Tool Training</p>
                <p className="text-sm font-medium text-gray-200">{linkedTool.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/inductions/profile#tool-${linkedTool.id}`}
                  className="rounded-lg bg-hacman-yellow px-3 py-1.5 text-xs font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
                >
                  View Training Status
                </Link>
                <Link
                  to={`/inductions/risk-assessment/${linkedTool.id}`}
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  ⚠ Risk Assessment
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-none">
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
