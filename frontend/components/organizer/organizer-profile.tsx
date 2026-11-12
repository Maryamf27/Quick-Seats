"use client";

import { useAuth } from "@/lib/auth/auth-context";

export function OrganizerProfile() { const { user } = useAuth(); if (!user) return null; return <section className="organizer-section"><header className="organizer-heading"><div><span className="eyebrow">Account</span><h1>Profile settings</h1><p>Your QuickSeats account information.</p></div></header><dl className="profile-details"><div><dt>Name</dt><dd>{user.fullName}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div></dl><p className="organizer-note">Profile editing is not supported by the account service.</p></section>; }
