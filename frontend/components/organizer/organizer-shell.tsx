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
    href: "/organizer/dashboard",
    label: "Overview",
    match: (pathname: string) => pathname === "/organizer/dashboard",
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
    href: "/organizer/events",
    label: "My Events",
    match: (pathname: string) =>
      pathname === "/organizer/events" ||
      (pathname.startsWith("/organizer/events/") &&
        !pathname.startsWith("/organizer/events/create")),
    icon: (
      <NavIcon>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v3M16 3v3" />
      </NavIcon>
    ),
  },
  {
    href: "/organizer/events/create",
    label: "Create Event",
    match: (pathname: string) => pathname.startsWith("/organizer/events/create"),
    icon: (
      <NavIcon>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v3M16 3v3" />
        <path d="M12 13.5v5M9.5 16h5" />
      </NavIcon>
    ),
  },
  {
    href: "/organizer/bookings",
    label: "Bookings",
    match: (pathname: string) => pathname.startsWith("/organizer/bookings"),
    icon: (
      <NavIcon>
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5v-1a2.5 2.5 0 0 0 0-5z" />
        <path d="M14.5 6v12" strokeDasharray="2.2 2.6" />
      </NavIcon>
    ),
  },
  {
    href: "/organizer/analytics",
    label: "Analytics",
    match: (pathname: string) => pathname.startsWith("/organizer/analytics"),
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
    href: "/organizer/profile",
    label: "Profile Settings",
    match: (pathname: string) => pathname.startsWith("/organizer/profile"),
    icon: (
      <NavIcon>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </NavIcon>
    ),
  },
] as const;

export function OrganizerShell({ children }: { children: ReactNode }) {
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

  const displayName = user?.fullName ?? "Organizer";
  const initials = displayName.trim().charAt(0).toUpperCase() || "O";
  // Prefer the most specific match so /organizer/events/create does not also
  // light up the parent "My Events" item.
  const activeHref =
    links
      .filter(({ match }) => match(pathname))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <ProtectedRoute roles={["ORGANIZER"]}>
      <div
        className={`organizer-shell page-shell${collapsed ? " organizer-shell--sidebar-closed" : ""}${navOpen ? " organizer-shell--nav-open" : ""}`}
      >
        <button
          type="button"
          className="organizer-sidebar__backdrop"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          onClick={() => setNavOpen(false)}
        />
        <aside className="organizer-sidebar" id="organizer-sidebar" aria-label="Organizer navigation">
          <div className="organizer-sidebar__brand-row">
            <Link href="/" className="organizer-brand" onClick={() => setNavOpen(false)}>
              quickseats<span>.</span>
            </Link>
            <button
              className="organizer-sidebar-toggle"
              type="button"
              aria-controls="organizer-sidebar"
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
              className="organizer-sidebar-close"
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="organizer-sidebar__identity">
            <span className="organizer-sidebar__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="organizer-sidebar__identity-copy">
              <strong>{displayName}</strong>
              <small>{user?.email ?? ""}</small>
            </div>
            <span className="organizer-sidebar__role">Event organizer</span>
          </div>
          <p className="organizer-sidebar__section-label">Workspace</p>
          <nav aria-label="Organizer navigation">
            {links.map(({ href, label, icon }) => {
              const active = href === activeHref;
              return (
                <Link
                  key={href}
                  href={href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="organizer-nav__icon">{icon}</span>
                  <span className="organizer-nav__label">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="organizer-sidebar__bottom">
            <Link href="/events" onClick={() => setNavOpen(false)}>
              Browse events
            </Link>
            <SignOutButton size="small" />
          </div>
        </aside>
        <main className="organizer-content">
          <header className="organizer-topbar">
            <button
              className="organizer-topbar__menu"
              type="button"
              aria-controls="organizer-sidebar"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="organizer-topbar__crumbs">QuickSeats / Organizer</span>
            <span className="organizer-topbar__profile">
              <span className="organizer-topbar__name">{displayName}</span>
              <b>ORGANIZER</b>
            </span>
          </header>
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
