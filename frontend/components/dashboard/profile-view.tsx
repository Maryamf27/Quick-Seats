"use client";

import { useAuth } from "@/lib/auth/auth-context";

export function ProfileView() {
  const { user } = useAuth();
  if (!user) return null;
  return <section className="dashboard-section"><header className="dashboard-heading"><div><span className="eyebrow">Your account</span><h1>Profile settings</h1><p>Your account information from QuickSeats.</p></div></header><dl className="profile-details"><div><dt>Full name</dt><dd>{user.fullName}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd></div></dl><p className="dashboard-note">Profile changes are not available yet.</p></section>;
}
