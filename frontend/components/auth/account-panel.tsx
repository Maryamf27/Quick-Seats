"use client";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleLabel } from "@/lib/auth/role-label";
import { SignOutButton } from "./sign-out-button";

export function AccountPanel() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <main className="page-shell account-page">
      <span className="eyebrow">Your QuickSeats account</span>
      <div className="account-page__heading">
        <div>
          <h1 className="account-page__title">Good to see you, {user.fullName}.</h1>
          <p className="auth-page__description">
            Your account details and access level.
          </p>
        </div>
        <Badge>{getRoleLabel(user.role)}</Badge>
      </div>
      <dl className="account-details">
        <div>
          <dt>Name</dt>
          <dd>{user.fullName}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Account role</dt>
          <dd>{getRoleLabel(user.role)}</dd>
        </div>
      </dl>
      <SignOutButton />
    </main>
  );
}
