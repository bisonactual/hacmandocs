import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const MANAGER_ALLOWED_ROUTES = [
  "/admin/users",
  "/admin/categories",
  "/admin/proposals",
  "/admin/import",
  "/admin/export",
  "/admin/areas",
  "/admin/tools",
  "/admin/quizzes",
];

export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const isAdmin = user?.permissionLevel === "Admin";
  const isManager = user?.groupLevel === "Manager";

  if (!isAdmin && !isManager) {
    return <Navigate to="/" replace />;
  }

  // For Managers (non-Admin), enforce route allowlist
  if (!isAdmin) {
    const currentPath = location.pathname;
    const isAllowed = MANAGER_ALLOWED_ROUTES.some(
      (route) => currentPath === route || currentPath.startsWith(route + "/")
    );
    if (!isAllowed) {
      return <Navigate to="/admin/users" replace />;
    }
  }

  const sections = [
    {
      label: "General",
      tabs: [
        { to: "/admin/users", label: "Users" },
      ],
    },
    {
      label: "Docs Portal",
      tabs: [
        { to: "/admin/categories", label: "Categories" },
        { to: "/admin/proposals", label: "Proposals" },
        ...(isAdmin ? [{ to: "/admin/groups", label: "Visibility Groups" }] : []),
        { to: "/admin/import", label: "Import" },
        { to: "/admin/export", label: "Export" },
      ],
    },
    {
      label: "Training Portal",
      tabs: [
        { to: "/admin/areas", label: "Areas" },
        { to: "/admin/tools", label: "Tools" },
        { to: "/admin/quizzes", label: "Quizzes" },
      ],
    },
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
                        `block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-hacman-yellow/10 font-medium text-hacman-yellow"
                            : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                        }`
                      }
                    >
                      {t.label}
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
