import { useRef, useEffect, useCallback } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileDrawer } from "../hooks/useMobileDrawer";
import NavigationSidebar from "./NavigationSidebar";
import SearchBar from "./SearchBar";
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
    <div className="flex h-screen flex-col bg-hacman-black">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-hacman-gray bg-hacman-dark px-3 py-3 md:px-5">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button
              ref={hamburgerRef}
              type="button"
              onClick={toggle}
              className="flex h-10 w-10 items-center justify-center rounded-md text-gray-300 hover:bg-hacman-gray hover:text-white transition-colors"
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
          <Link to="/" className="flex items-center gap-3 text-white hover:text-hacman-yellow transition-colors">
            <HacmanLogo className="h-8" />
            <div className="hidden sm:block">
              <span className="text-[10px] uppercase tracking-widest text-hacman-muted leading-none block">
                Documentation &amp; Training
              </span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
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

        <main className="flex-1 overflow-y-auto bg-[#0f0f0f] p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
