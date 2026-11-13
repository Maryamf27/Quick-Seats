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
    href: "/admin/dashboard",
    label: "Overview",
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
    href: "/admin/users",
    label: "Users",
    icon: (
      <NavIcon>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/organizers",
    label: "Organizers",
    icon: (
      <NavIcon>
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
        <path d="M3 12.5h18" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/events",
    label: "Events",
    icon: (
      <NavIcon>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v3M16 3v3" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/venues",
    label: "Venues",
    icon: (
      <NavIcon>
        <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/bookings",
    label: "Bookings",
    icon: (
      <NavIcon>
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5v-1a2.5 2.5 0 0 0 0-5z" />
        <path d="M14.5 6v12" strokeDasharray="2.2 2.6" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: (
      <NavIcon>
        <path d="M3.5 20.5h17" />
        <rect x="5" y="11.5" width="3.4" height="6.5" rx="1.2" />
        <rect x="10.3" y="6.5" width="3.4" height="11.5" rx="1.2" />
        <rect x="15.6" y="14.5" width="3.4" height="3.5" rx="1.2" />
      </NavIcon>
    ),
  },
  {
    href: "/admin/organizer-applications",
    label: "Organizer applications",
    icon: (
      <NavIcon>
        <path d="M4.5 8.5 6.2 5.2A1.5 1.5 0 0 1 7.5 4.5h9a1.5 1.5 0 0 1 1.3.7l1.7 3.3" />
        <path d="M4.5 8.5v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" />
        <path d="M9 12.5h6" />
      </NavIcon>
    ),
  },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
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

  const displayName = user?.fullName ?? "Administrator";
  const initials = displayName.trim().charAt(0).toUpperCase() || "A";

  return (
    <ProtectedRoute roles={["ADMIN"]}>
      <main
        className={`admin-shell page-shell${collapsed ? " admin-shell--sidebar-closed" : ""}${navOpen ? " admin-shell--nav-open" : ""}`}
      >
        <button
          type="button"
          className="admin-sidebar__backdrop"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
        />
        <aside className="admin-sidebar" id="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar__brand-row">
            <Link href="/" className="organizer-brand" onClick={() => setNavOpen(false)}>
              quickseats<span>.</span>
            </Link>
            <button
              className="admin-sidebar-toggle"
              type="button"
              aria-controls="admin-sidebar"
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
              className="admin-sidebar-close"
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="admin-sidebar__identity">
            <span className="admin-sidebar__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="admin-sidebar__identity-copy">
              <strong>{displayName}</strong>
              <small>{user?.email ?? ""}</small>
            </div>
            <span className="admin-sidebar__role">Platform administrator</span>
          </div>
          <p className="admin-sidebar__section-label">Management</p>
          <nav aria-label="Platform management">
            {links.map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="admin-nav__icon">{icon}</span>
                  <span className="admin-nav__label">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="admin-sidebar__bottom">
            <SignOutButton size="small" />
          </div>
        </aside>
        <div className="admin-main">
          <header className="admin-topbar">
            <button
              className="admin-topbar__menu"
              type="button"
              aria-controls="admin-sidebar"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="admin-topbar__crumbs">QuickSeats / Administration</span>
            <span className="admin-topbar__profile">
              <span className="admin-topbar__name">{displayName}</span>
              <b>ADMIN</b>
            </span>
          </header>
          {children}
        </div>
      </main>
    </ProtectedRoute>
  );
}
