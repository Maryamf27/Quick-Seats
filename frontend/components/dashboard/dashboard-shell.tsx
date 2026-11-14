"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/auth-context";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const links = [
  {
    href: "/dashboard",
    label: "Overview",
    exact: true,
    icon: (
      <NavIcon>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      </NavIcon>
    ),
  },
  {
    href: "/dashboard/bookings",
    label: "My Bookings",
    exact: false,
    icon: (
      <NavIcon>
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5v-1a2.5 2.5 0 0 0 0-5z" />
        <path d="M14.5 6v12" strokeDasharray="2.2 2.6" />
      </NavIcon>
    ),
  },
  {
    href: "/dashboard/profile",
    label: "Profile Settings",
    exact: false,
    icon: (
      <NavIcon>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </NavIcon>
    ),
  },
  {
    href: "/become-organizer",
    label: "Become an Organizer",
    exact: true,
    icon: (
      <NavIcon>
        <path d="M12 3v18M3 12h18" />
      </NavIcon>
    ),
  },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Lock background scroll and support Escape while the drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  const displayName = user?.fullName ?? "Customer";
  const initials = displayName.trim().charAt(0).toUpperCase() || "U";

  return (
    <ProtectedRoute>
      <div
        className={`dashboard page-shell${collapsed ? " dashboard--sidebar-closed" : ""}${navOpen ? " dashboard--nav-open" : ""}`}
      >
        <button
          type="button"
          className="dashboard__backdrop"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
        />
        <aside className="dashboard__sidebar" id="dashboard-sidebar" aria-label="Account navigation">
          <div className="dashboard__brand-row">
            <Link href="/" className="dashboard__brand" onClick={() => setNavOpen(false)}>
              quickseats<span>.</span>
            </Link>
            <button
              className="dashboard__toggle"
              type="button"
              aria-controls="dashboard-sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((open) => !open)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3.5" y="4" width="17" height="16" rx="2" />
                <path d={collapsed ? "M9 9l3 3-3 3M15 4v16" : "M9 4v16M14 9l-3 3 3 3"} />
              </svg>
            </button>
            <button
              className="dashboard__close"
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="dashboard__identity">
            <span className="dashboard__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="dashboard__identity-copy">
              <strong>{displayName}</strong>
              <small>{user?.email ?? ""}</small>
            </div>
            <span className="dashboard__role">Account</span>
          </div>
          <p className="dashboard__section-label">Your account</p>
          <nav aria-label="Account navigation" className="dashboard__nav">
            {links
              .filter((link) => link.href !== "/become-organizer" || user?.role === "USER")
              .map(({ href, label, exact, icon }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={active ? "is-active" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setNavOpen(false)}
                  >
                    <span className="dashboard-nav__icon">{icon}</span>
                    <span className="dashboard-nav__label">{label}</span>
                  </Link>
                );
              })}
          </nav>
          <div className="dashboard__sidebar-bottom">
            <Link href="/events" onClick={() => setNavOpen(false)}>
              Browse events
            </Link>
            <SignOutButton size="small" />
          </div>
        </aside>
        <main className="dashboard__main">
          <header className="dashboard__topbar">
            <button
              className="dashboard__menu"
              type="button"
              aria-controls="dashboard-sidebar"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="dashboard__topbar-crumbs">QuickSeats / Account</span>
            <span className="dashboard__topbar-profile">
              <span className="dashboard__topbar-name">{displayName}</span>
              <b>{user?.role ?? "USER"}</b>
            </span>
          </header>
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
