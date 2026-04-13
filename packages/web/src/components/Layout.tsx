import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import NavigationSidebar from "./NavigationSidebar";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";

export default function Layout() {
  const { user, token, logout } = useAuth();

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <h1 className="text-lg font-bold text-gray-900">HACMan Docs</h1>
        <div className="flex items-center gap-3">
          <SearchBar />
          {token && <NotificationBell />}
          {user ? (
            <>
              <span className="text-sm text-gray-600">
                {user.name || user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <NavigationSidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
