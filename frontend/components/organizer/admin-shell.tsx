"use client";

import Link from "next/link";
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
  ["/admin/bookings", "Bookings"],
  ["/admin/analytics", "Analytics"],
  ["/admin/organizer-applications", "Organizer applications"],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <ProtectedRoute roles={["ADMIN"]}>
      <main className="admin-shell page-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <Link href="/" className="organizer-brand">quickseats<span>.</span></Link>
          <div className="admin-sidebar__identity">
            <strong>{user?.fullName ?? "Administrator"}</strong>
            <small>{user?.email ?? ""}</small>
            <span>Platform administrator</span>
          </div>
          <nav aria-label="Platform management">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className={pathname === href ? "is-active" : undefined} aria-current={pathname === href ? "page" : undefined}>
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
