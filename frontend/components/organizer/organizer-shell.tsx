"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/auth-context";

const links = [
  ["/organizer/dashboard", "Overview"], ["/organizer/events", "My Events"],
  ["/organizer/events/create", "Create Event"], ["/organizer/bookings", "Bookings"],
  ["/organizer/analytics", "Analytics"], ["/organizer/profile", "Profile Settings"],
] as const;

export function OrganizerShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const { user } = useAuth();
  return <ProtectedRoute roles={["ORGANIZER"]}><div className="organizer-shell page-shell">
    <aside className="organizer-sidebar"><Link href="/" className="organizer-brand">quickseats<span>.</span></Link><div className="organizer-identity"><strong>{user?.fullName}</strong><small>{user?.email}</small><small>Event organizer</small></div>
      <nav aria-label="Organizer navigation">{links.map(([href, label]) => { const active = path === href || (href !== "/organizer/dashboard" && path.startsWith(href)); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}>{label}</Link>; })}</nav>
      <div className="organizer-sidebar__bottom"><Link href="/events">Browse events</Link><SignOutButton size="small" /></div>
    </aside><main className="organizer-content">{children}</main>
  </div></ProtectedRoute>;
}
