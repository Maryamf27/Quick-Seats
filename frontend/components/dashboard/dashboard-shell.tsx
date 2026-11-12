"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/auth-context";

const links = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/bookings", label: "My Bookings", exact: false },
  { href: "/dashboard/profile", label: "Profile Settings", exact: false },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      <div className="dashboard page-shell">
        <aside className="dashboard__sidebar">
          <Link href="/" className="dashboard__brand">quickseats<span>.</span></Link>
          <div className="dashboard__identity">
            <span className="dashboard__avatar" aria-hidden="true">{user?.fullName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{user?.fullName}</strong><small>{user?.email}</small></span>
          </div>
          <nav aria-label="Account navigation" className="dashboard__nav">
            {links.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}>{link.label}</Link>;
            })}
          </nav>
          <div className="dashboard__sidebar-bottom"><Link href="/events">Browse events</Link><SignOutButton size="small" /></div>
        </aside>
        <main className="dashboard__main">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
