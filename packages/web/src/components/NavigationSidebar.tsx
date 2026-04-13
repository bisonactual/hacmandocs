import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface DocumentItem {
  id: string;
  title: string;
  categoryId: string | null;
  isSensitive: boolean;
}

interface CategoryNode extends CategoryItem {
  children: CategoryNode[];
  documents: DocumentItem[];
}

function buildTree(
  categories: CategoryItem[],
  documents: DocumentItem[],
): { tree: CategoryNode[]; uncategorized: DocumentItem[] } {
  const map = new Map<string, CategoryNode>();
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [], documents: [] });
  }

  const uncategorized: DocumentItem[] = [];

  // Assign documents to their categories
  for (const doc of documents) {
    if (doc.categoryId && map.has(doc.categoryId)) {
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

  const sort = (nodes: CategoryNode[]) =>
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
  sort(roots);
  for (const node of map.values()) sort(node.children);

  return { tree: roots, uncategorized };
}

function CategoryTreeNode({ node }: { node: CategoryNode }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0 || node.documents.length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
        aria-expanded={expanded}
      >
        <span className="w-4 text-gray-400">
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="font-medium text-gray-700">{node.name}</span>
      </button>

      {expanded && (
        <ul className="ml-4 space-y-0.5">
          {node.children.map((child) => (
            <CategoryTreeNode key={child.id} node={child} />
          ))}
          {node.documents.map((doc) => (
            <li key={doc.id}>
              <NavLink
                to={`/documents/${doc.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-1 rounded px-2 py-1 text-sm ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                {doc.isSensitive && (
                  <span
                    className="text-amber-500"
                    title="Sensitive document"
                    aria-label="Sensitive document"
                  >
                    🔒
                  </span>
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

export default function NavigationSidebar() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<CategoryItem[]>("/api/categories"),
      apiFetch<DocumentItem[]>("/api/documents"),
    ])
      .then(([cats, docs]) => {
        setCategories(cats);
        setDocuments(docs);
      })
      .finally(() => setLoading(false));
  }, []);

  const { tree, uncategorized } = buildTree(categories, documents);

  return (
    <nav
      className="flex h-full w-64 flex-col border-r border-gray-200 bg-white"
      aria-label="Document navigation"
    >
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-4 text-sm text-gray-400">Loading…</p>
        ) : tree.length === 0 && uncategorized.length === 0 ? (
          <p className="px-2 py-4 text-sm text-gray-400">No documents yet</p>
        ) : (
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <CategoryTreeNode key={node.id} node={node} />
            ))}
            {uncategorized.length > 0 && (
              <li>
                <p className="mt-2 px-2 py-1 text-xs font-semibold uppercase text-gray-400">
                  Uncategorized
                </p>
                <ul className="space-y-0.5">
                  {uncategorized.map((doc) => (
                    <li key={doc.id}>
                      <NavLink
                        to={`/documents/${doc.id}`}
                        className={({ isActive }) =>
                          `flex items-center gap-1 rounded px-2 py-1 text-sm ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-600 hover:bg-gray-100"
                          }`
                        }
                      >
                        {doc.isSensitive && (
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
    </nav>
  );
}
