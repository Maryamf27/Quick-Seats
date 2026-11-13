"use client";

import { ProfileForms } from "@/components/dashboard/profile-view";

export function OrganizerProfile() {
  return (
    <section className="organizer-section">
      <header className="organizer-heading">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Profile settings</h1>
          <p>Manage your organizer account details.</p>
        </div>
      </header>
      <ProfileForms />
    </section>
  );
}
