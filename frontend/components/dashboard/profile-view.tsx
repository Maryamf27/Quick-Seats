"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.backendMessage) return error.backendMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProfileView() {
  const { user, accessToken, updateUser } = useAuth();
  const { notify } = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const trimmed = fullName.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setNameError("Enter a name between 2 and 120 characters.");
      return;
    }
    if (!accessToken || trimmed === user?.fullName) return;
    setNameError("");
    setSavingName(true);
    try {
      updateUser(await authApi.updateProfile({ fullName: trimmed }, accessToken));
      notify("Profile updated.", "success");
    } catch (error: unknown) {
      setNameError(messageFor(error, "Your profile could not be updated."));
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!currentPassword) return setPasswordError("Enter your current password.");
    if (!PASSWORD_RULE.test(newPassword)) {
      return setPasswordError("New password needs 8+ characters with upper-case, lower-case and a number.");
    }
    if (newPassword !== confirmPassword) return setPasswordError("The new passwords do not match.");
    if (!accessToken) return;
    setPasswordError("");
    setSavingPassword(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword }, accessToken);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Password changed.", "success");
    } catch (error: unknown) {
      setPasswordError(messageFor(error, "Your password could not be changed."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="dashboard-section">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Profile settings</h1>
          <p>Manage your QuickSeats account details.</p>
        </div>
      </header>

      <dl className="profile-details">
        <div><dt>Email address</dt><dd>{user.email}</dd></div>
        <div><dt>Account type</dt><dd>{user.role}</dd></div>
        <div><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd></div>
      </dl>

      <form className="profile-form" onSubmit={(event) => void saveName(event)} noValidate>
        <h2>Name</h2>
        <Input label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} error={nameError} autoComplete="name" maxLength={120} />
        <Button type="submit" loading={savingName} disabled={savingName || fullName.trim() === user.fullName}>Save name</Button>
      </form>

      <form className="profile-form" onSubmit={(event) => void savePassword(event)} noValidate>
        <h2>Change password</h2>
        <Input label="Current password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        <Input label="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" hint="At least 8 characters with upper-case, lower-case and a number." />
        <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" error={passwordError} />
        <Button type="submit" loading={savingPassword} disabled={savingPassword}>Change password</Button>
      </form>
    </section>
  );
}
