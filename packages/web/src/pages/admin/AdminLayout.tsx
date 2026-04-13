import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const tabs = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/groups", label: "Groups" },
  { to: "/admin/import", label: "Import" },
  { to: "/admin/export", label: "Export" },
];

export default function AdminLayout() {
  const { user } = useAuth();

  if (user?.permissionLevel !== "Admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-800">Admin Panel</h2>
      <nav className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium ${
                isActive
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
