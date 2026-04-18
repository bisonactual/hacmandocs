import { useRef, useEffect, useCallback } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileDrawer } from "../hooks/useMobileDrawer";
import NavigationSidebar from "./NavigationSidebar";
import SearchBar from "./SearchBar";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import HacmanLogo from "./HacmanLogo";

export default function Layout() {
  const { user, token, logout } = useAuth();
  const { isOpen, isMobile, toggle, close } = useMobileDrawer();
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close drawer on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Return focus to hamburger when drawer closes
  const handleNavigate = useCallback(() => {
    close();
    setTimeout(() => hamburgerRef.current?.focus(), 0);
  }, [close]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-hacman-black">
      {/* Header */}
      <header className="flex min-w-0 items-center justify-between border-b border-hacman-gray bg-hacman-dark px-3 py-3 md:px-5">
        <div className="flex min-w-0 shrink items-center gap-2 md:gap-3">
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button
              ref={hamburgerRef}
              type="button"
              onClick={toggle}
              className="flex h-10 w-10 items-center justify-center rounded-md text-gray-300 hover:bg-hacman-gray hover:text-hacman-text transition-colors"
              aria-label={isOpen ? "Close navigation" : "Open navigation"}
            >
              {isOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          )}
          <Link to="/" className="flex min-w-0 items-center gap-3 text-hacman-text hover:text-hacman-yellow transition-colors">
            <HacmanLogo className="hidden h-8 shrink-0 md:block" />
            <div className="hidden md:block">
              <span className="text-[10px] uppercase tracking-widest text-hacman-muted leading-none block">
                Documentation &amp; Training
              </span>
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <ThemeToggle />
          <SearchBar />
          {token && <NotificationBell />}
          {user ? (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-hacman-yellow text-hacman-black text-sm font-bold">
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm text-gray-300 md:block">
                  {user.name || user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-hacman-gray px-2 py-1.5 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors"
                aria-label="Logout"
              >
                <span className="hidden md:inline">Logout</span>
                <svg className="h-4 w-4 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
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
      <div className="relative flex flex-1 overflow-hidden">
        {/* Desktop sidebar — always visible at md+ */}
        {!isMobile && <NavigationSidebar />}

        {/* Mobile drawer overlay */}
        {isMobile && isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/60 transition-opacity"
              onClick={close}
              aria-hidden="true"
            />
            {/* Drawer */}
            <div className="fixed inset-y-0 left-0 z-50 w-72 shadow-xl animate-slide-in-left">
              <NavigationSidebar onNavigate={handleNavigate} />
            </div>
          </>
        )}

        <main className="flex-1 overflow-y-auto bg-hacman-deeper p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
