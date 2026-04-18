import { useEffect, useState } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { apiFetch } from "../../lib/api";

const APPROVER_ALLOWED_ROUTES = [
  "/admin/categories",
  "/admin/proposals",
  "/admin/recycle-bin",
  "/admin/export",
];

const MANAGER_ALLOWED_ROUTES = [
  "/admin/users",
  "/admin/categories",
  "/admin/proposals",
  "/admin/recycle-bin",
  "/admin/import",
  "/admin/export",
  "/admin/areas",
  "/admin/tools",
  "/admin/quizzes",
  "/admin/risk-assessments",
];

export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin = user?.permissionLevel === "Admin";
  const isApprover = user?.permissionLevel === "Approver";
  const isManager = user?.groupLevel === "Manager";

  const hasAccess = isAdmin || isManager || isApprover;

  useEffect(() => {
    if (!hasAccess) return;
    Promise.all([
      apiFetch<{ status: string }[]>("/api/proposals?status=pending").catch(() => []),
      apiFetch<{ status: string }[]>("/api/delete-proposals?status=pending").catch(() => []),
      apiFetch<{ status: string }[]>("/api/ra-proposals?status=pending").catch(() => []),
    ]).then(([editProps, deleteProps, raProps]) => {
      setPendingCount(editProps.length + deleteProps.length + raProps.length);
    });
  }, [hasAccess]);

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  // Enforce route allowlists for non-Admin users
  if (!isAdmin) {
    const currentPath = location.pathname;
    const allowedRoutes = isManager ? MANAGER_ALLOWED_ROUTES : APPROVER_ALLOWED_ROUTES;
    const defaultRoute = isManager ? "/admin/users" : "/admin/proposals";
    const isAllowed = allowedRoutes.some(
      (route) => currentPath === route || currentPath.startsWith(route + "/")
    );
    if (!isAllowed) {
      return <Navigate to={defaultRoute} replace />;
    }
  }

  // Build tab sections based on access level
  const generalTabs = (isAdmin || isManager)
    ? [{ to: "/admin/users", label: "Users" }]
    : [];

  const docsPortalTabs = [
    ...(isAdmin || isManager || isApprover
      ? [{ to: "/admin/categories", label: "Categories" }]
      : []),
    ...(isAdmin || isManager || isApprover
      ? [{ to: "/admin/proposals", label: "Proposals", badge: pendingCount }]
      : []),
    ...(isAdmin || isManager || isApprover
      ? [{ to: "/admin/recycle-bin", label: "Recycle Bin" }]
      : []),
    ...(isAdmin
      ? [{ to: "/admin/groups", label: "Visibility Groups" }]
      : []),
    ...(isAdmin || isManager
      ? [{ to: "/admin/import", label: "Import" }]
      : []),
    { to: "/admin/export", label: "Export" },
  ];

  const trainingTabs = (isAdmin || isManager)
    ? [
        { to: "/admin/areas", label: "Areas" },
        { to: "/admin/tools", label: "Tools" },
        { to: "/admin/quizzes", label: "Quizzes & Information" },
        { to: "/admin/risk-assessments/import", label: "Import Risk Assessments" },
      ]
    : [];

  const sections = [
    ...(generalTabs.length > 0 ? [{ label: "General", tabs: generalTabs }] : []),
    { label: "Docs Portal", tabs: docsPortalTabs },
    ...(trainingTabs.length > 0 ? [{ label: "Training Portal", tabs: trainingTabs }] : []),
  ];

  return (
    <div className="flex gap-8">
      {/* Sidebar navigation */}
      <aside className="w-52 shrink-0">
        <h2 className="mb-5 text-xl font-semibold text-white">Admin Panel</h2>
        <nav className="space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-hacman-muted">
                {section.label}
              </h3>
              <ul className="space-y-0.5">
                {section.tabs.map((t) => (
                  <li key={t.to}>
                    <NavLink
                      to={t.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-hacman-yellow/10 font-medium text-hacman-yellow"
                            : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                        }`
                      }
                    >
                      {t.label}
                      {"badge" in t && (t as { badge?: number }).badge ? (
                        <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-hacman-yellow px-1.5 text-xs font-bold text-hacman-black">
                          {(t as { badge?: number }).badge}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
