"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/auth-context";

const links = [
  ["/admin/dashboard", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/organizers", "Organizers"],
  ["/admin/events", "Events"],
  ["/admin/venues", "Venues"],
  ["/admin/bookings", "Bookings"],
  ["/admin/analytics", "Analytics"],
  ["/admin/organizer-applications", "Organizer applications"],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProtectedRoute roles={["ADMIN"]}>
      <main className={`admin-shell page-shell${sidebarOpen ? "" : " admin-shell--sidebar-closed"}`}>
        <aside className="admin-sidebar" id="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar__brand-row">
            <Link href="/" className="organizer-brand">quickseats<span>.</span></Link>
            <button
              className="admin-sidebar-toggle"
              type="button"
              aria-controls="admin-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3.5" y="4" width="17" height="16" rx="2" />
                <path d={sidebarOpen ? "M9 4v16M14 9l-3 3 3 3" : "M9 9l3 3-3 3M15 4v16"} />
              </svg>
            </button>
          </div>
          <div className="admin-sidebar__identity">
            <strong>{user?.fullName ?? "Administrator"}</strong>
            <small>{user?.email ?? ""}</small>
            <span>Platform administrator</span>
          </div>
          <nav aria-label="Platform management">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className={(pathname === href || pathname.startsWith(`${href}/`)) ? "is-active" : undefined} aria-current={(pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="admin-sidebar__bottom"><SignOutButton size="small" /></div>
        </aside>
        <div className="admin-main">
          <header className="admin-topbar">
            <span>QuickSeats / Administration</span>
            <span className="admin-topbar__profile">{user?.fullName ?? "Administrator"} <b>ADMIN</b></span>
          </header>
          {children}
        </div>
      </main>
    </ProtectedRoute>
  );
}
