import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isPrivate?: boolean;
}

interface DocumentItem {
  id: string;
  title: string;
  categoryId: string | null;
  isSensitive: boolean;
  isPublished: number;
}

interface CategoryNode extends CategoryItem {
  children: CategoryNode[];
  documents: DocumentItem[];
}

function buildTree(
  categories: CategoryItem[],
  documents: DocumentItem[],
): { tree: CategoryNode[]; uncategorized: DocumentItem[]; privateTree: CategoryNode[]; privateDocs: DocumentItem[] } {
  const publicCats = categories.filter((c) => !c.isPrivate);
  const privateCats = categories.filter((c) => c.isPrivate);
  const privateCatIds = new Set(privateCats.map((c) => c.id));

  const map = new Map<string, CategoryNode>();
  for (const cat of publicCats) {
    map.set(cat.id, { ...cat, children: [], documents: [] });
  }

  const privateMap = new Map<string, CategoryNode>();
  for (const cat of privateCats) {
    privateMap.set(cat.id, { ...cat, children: [], documents: [] });
  }

  const uncategorized: DocumentItem[] = [];
  const privateDocs: DocumentItem[] = [];

  for (const doc of documents) {
    if (doc.categoryId && privateCatIds.has(doc.categoryId)) {
      privateMap.get(doc.categoryId)?.documents.push(doc);
    } else if (doc.categoryId && map.has(doc.categoryId)) {
      map.get(doc.categoryId)!.documents.push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const privateRoots: CategoryNode[] = [];
  for (const node of privateMap.values()) {
    if (node.parentId && privateMap.has(node.parentId)) {
      privateMap.get(node.parentId)!.children.push(node);
    } else {
      privateRoots.push(node);
    }
  }

  const sort = (nodes: CategoryNode[]) =>
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
  sort(roots);
  for (const node of map.values()) sort(node.children);
  sort(privateRoots);
  for (const node of privateMap.values()) sort(node.children);

  return { tree: roots, uncategorized, privateTree: privateRoots, privateDocs };
}

function CategoryTreeNode({ node, onNavigate }: { node: CategoryNode; onNavigate?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0 || node.documents.length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hacman-gray transition-colors"
        aria-expanded={expanded}
      >
        <span className="w-4 text-hacman-muted text-xs">
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="font-medium text-gray-300">{node.name}</span>
      </button>

      {expanded && (
        <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-hacman-gray pl-2">
          {node.children.map((child) => (
            <CategoryTreeNode key={child.id} node={child} onNavigate={onNavigate} />
          ))}
          {node.documents.map((doc) => (
            <li key={doc.id}>
              <NavLink
                to={`/documents/${doc.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-hacman-yellow/10 text-hacman-yellow"
                      : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                  }`
                }
              >
                {!!doc.isSensitive && (
                  <span className="text-amber-500" title="Sensitive document" aria-label="Sensitive document">🔒</span>
                )}
                <span className="truncate">{doc.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PrivateDocsSection({ privateTree, privateDocs, onNavigate }: { privateTree: CategoryNode[]; privateDocs: DocumentItem[]; onNavigate?: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hacman-gray transition-colors"
        aria-expanded={expanded}
      >
        <span>🔒</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">Private Docs</span>
        <span className="ml-auto text-xs text-hacman-muted">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {privateTree.map((node) => (
            <CategoryTreeNode key={node.id} node={node} onNavigate={onNavigate} />
          ))}
          {privateDocs.map((doc) => (
            <li key={doc.id}>
              <NavLink
                to={`/documents/${doc.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-hacman-yellow/10 text-hacman-yellow"
                      : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                  }`
                }
              >
                <span className="truncate">{doc.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function NavigationSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([
      apiFetch<CategoryItem[]>("/api/categories"),
      apiFetch<DocumentItem[]>("/api/documents"),
    ])
      .then(([cats, docs]) => {
        setCategories(cats);
        // The API already filters by visibility and publish status —
        // no need to re-filter here.
        setDocuments(docs);
      })
      .finally(() => setLoading(false));
  }, []);

  const { tree, uncategorized, privateTree, privateDocs } = buildTree(categories, documents);
  const hasPrivateContent = privateTree.length > 0 || privateDocs.length > 0;

  return (
    <nav
      className="flex h-full w-72 flex-col border-r border-hacman-gray bg-hacman-dark"
      aria-label="Document navigation"
    >
      {/* Documents section header */}
      <div className="border-b border-hacman-gray px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-hacman-yellow">📄</span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
              Documents
            </h2>
          </div>
          <Link
            to={user ? "/documents/new" : "/login"}
            state={!user ? { from: { pathname: "/documents/new" }, message: "create" } : undefined}
            className="rounded px-2 py-0.5 text-xs text-hacman-yellow hover:bg-hacman-yellow/10 transition-colors"
            title="Create new document"
          >
            + New
          </Link>
        </div>
      </div>

      {/* Document tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
            <span className="text-sm text-hacman-muted">Loading…</span>
          </div>
        ) : tree.length === 0 && uncategorized.length === 0 ? (
          <p className="px-3 py-4 text-sm text-hacman-muted">No documents yet</p>
        ) : (
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <CategoryTreeNode key={node.id} node={node} onNavigate={onNavigate} />
            ))}
            {uncategorized.length > 0 && (
              <li>
                <p className="mt-3 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-hacman-muted">
                  Uncategorized
                </p>
                <ul className="space-y-0.5">
                  {uncategorized.map((doc) => (
                    <li key={doc.id}>
                      <NavLink
                        to={`/documents/${doc.id}`}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-hacman-yellow/10 text-hacman-yellow"
                              : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                          }`
                        }
                      >
                        {!!doc.isSensitive && (
                          <span className="text-amber-500" title="Sensitive document">🔒</span>
                        )}
                        <span className="truncate">{doc.title}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Private Docs section — only shown if user has access to private categories */}
      {hasPrivateContent && (
        <div className="border-t border-hacman-gray p-2">
          <PrivateDocsSection privateTree={privateTree} privateDocs={privateDocs} onNavigate={onNavigate} />
        </div>
      )}

      {/* Training section for logged-in users */}
      {user && (
        <div className="border-t border-hacman-gray p-2">
          <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-hacman-muted">
            Training
          </p>
          <ul className="space-y-0.5">
            <li>
              <NavLink
                to="/inductions/profile"
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-hacman-yellow/10 text-hacman-yellow"
                      : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                  }`
                }
              >
                <span>🎓</span>
                My Training
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/inductions/trainer"
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-hacman-yellow/10 text-hacman-yellow"
                      : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                  }`
                }
              >
                <span>👨‍🏫</span>
                Trainer Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/leaderboard"
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-hacman-yellow/10 text-hacman-yellow"
                      : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
                  }`
                }
              >
                <span>🏆</span>
                Top 5
              </NavLink>
            </li>
          </ul>
        </div>
      )}

      {/* Admin link */}
      {(user?.permissionLevel === "Admin" || user?.permissionLevel === "Approver" || user?.groupLevel === "Manager") && (
        <div className="border-t border-hacman-gray p-2">
          <NavLink
            to="/admin"
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-hacman-yellow/10 text-hacman-yellow"
                  : "text-gray-400 hover:bg-hacman-gray hover:text-gray-200"
              }`
            }
          >
            <span>⚙️</span>
            Admin Panel
          </NavLink>
        </div>
      )}
    </nav>
  );
}
