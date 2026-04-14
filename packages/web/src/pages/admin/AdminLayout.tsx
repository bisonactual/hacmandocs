import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

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
      { to: "/admin/groups", label: "Visibility Groups" },
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

export default function AdminLayout() {
  const { user } = useAuth();

  if (user?.permissionLevel !== "Admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-white">Admin Panel</h2>
      <nav className="mb-6 border-b border-hacman-gray">
        <div className="flex gap-6">
          {sections.map((section) => (
            <div key={section.label} className="flex items-center gap-1">
              <span className="text-xs text-hacman-muted uppercase tracking-wide mr-1">{section.label}</span>
              {section.tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    `px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-b-2 border-hacman-yellow text-hacman-yellow"
                        : "text-gray-400 hover:text-gray-200"
                    }`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
