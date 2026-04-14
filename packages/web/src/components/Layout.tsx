import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import NavigationSidebar from "./NavigationSidebar";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import HacmanLogo from "./HacmanLogo";

export default function Layout() {
  const { user, token, logout } = useAuth();

  return (
    <div className="flex h-screen flex-col bg-hacman-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-hacman-gray bg-hacman-dark px-5 py-3">
        <Link to="/" className="flex items-center gap-3 text-white hover:text-hacman-yellow transition-colors">
          <HacmanLogo className="h-8" />
          <div className="hidden sm:block">
            <span className="text-[10px] uppercase tracking-widest text-hacman-muted leading-none block">
              Documentation &amp; Training
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <SearchBar />
          {token && <NotificationBell />}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-hacman-yellow text-hacman-black text-sm font-bold">
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm text-gray-300 sm:block">
                  {user.name || user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-hacman-gray px-3 py-1.5 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded-md bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <NavigationSidebar />
        <main className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
