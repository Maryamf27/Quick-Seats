"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileForms } from "@/components/dashboard/profile-view";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleLabel } from "@/lib/auth/role-label";
import { getAccountMenuItems, getInitials } from "./account-menu";
import { SignOutButton } from "./sign-out-button";

const descriptions: Record<string, string> = {
  "/dashboard": "Your upcoming events and booking stats at a glance.",
  "/dashboard/bookings": "Tickets, receipts and cancellations for every order.",
  "/become-organizer": "Apply to publish your own events on QuickSeats.",
  "/organizer/dashboard": "Sales, revenue and how your events are performing.",
  "/organizer/events": "Create, edit and manage seats for your events.",
  "/organizer/bookings": "Everyone who has booked one of your events.",
  "/admin/dashboard": "Users, organizers, venues and platform analytics.",
};

function memberSince(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function AccountPanel() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const shortcuts = getAccountMenuItems(user.role).filter((item) => item.href !== "/account");
  const since = memberSince(user.createdAt);

  return (
    <main className="page-shell account-hub">
      <nav className="account-hub__crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Account</span>
      </nav>

      <section className="account-hub__profile" aria-labelledby="account-name">
        <span className="account-hub__avatar" aria-hidden="true">{getInitials(user.fullName)}</span>
        <div className="account-hub__identity">
          <span className="eyebrow">Your QuickSeats account</span>
          <h1 id="account-name">{user.fullName}</h1>
          <p>
            <span>{user.email}</span>
            {since ? <span>Member since {since}</span> : null}
          </p>
        </div>
        <div className="account-hub__profile-actions">
          <Badge>{getRoleLabel(user.role)}</Badge>
          <Button href="/events" size="small">Browse events</Button>
        </div>
      </section>

      <section className="account-hub__section" aria-labelledby="account-shortcuts">
        <h2 id="account-shortcuts">Go to</h2>
        <ul className="account-hub__shortcuts">
          {shortcuts.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="account-hub__shortcut">
                <span className="account-hub__shortcut-icon">{item.icon}</span>
                <span className="account-hub__shortcut-copy">
                  <strong>{item.label}</strong>
                  {descriptions[item.href] ? <small>{descriptions[item.href]}</small> : null}
                </span>
                <span className="account-hub__shortcut-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="account-hub__section" aria-labelledby="account-settings">
        <h2 id="account-settings">Settings</h2>
        <div className="account-hub__settings">
          <ProfileForms showDetails={false} />
        </div>
      </section>

      <section className="account-hub__signout" aria-label="Sign out">
        <div>
          <strong>Sign out of QuickSeats</strong>
          <p>You’ll need your email and password to sign back in on this device.</p>
        </div>
        <SignOutButton size="small" />
      </section>
    </main>
  );
}
