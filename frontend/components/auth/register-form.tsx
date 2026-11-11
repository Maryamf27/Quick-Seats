"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { validateRegistration } from "@/lib/auth/validation";
import type { RegistrationFieldErrors } from "@/lib/auth/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPageFrame, GuestOnlyRoute } from "./route-guards";

function getRegistrationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return "An account with this email already exists. Try signing in instead.";
    }
    return error.message;
  }
  return "We couldn’t create your account. Please try again.";
}

export function RegisterForm() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateRegistration({
      fullName,
      email,
      password,
      confirmPassword,
    });
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      setCreatedEmail(user.email);
    } catch (error: unknown) {
      setFormError(getRegistrationError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GuestOnlyRoute>
      <AuthPageFrame
        eyebrow="A seat at the table"
        title={createdEmail ? "You’re on the list." : "Make it a night to remember."}
        description={
          createdEmail
            ? "Your account is ready. Sign in to continue."
            : "Create your account and start making room for the moments that matter."
        }
        footer={
          createdEmail ? (
            <p>
              Already registered? <Link href="/login">Sign in</Link>
            </p>
          ) : (
            <p>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          )
        }
      >
        {createdEmail ? (
          <div className="auth-form__success" role="status">
            <p>
              An account was created for <strong>{createdEmail}</strong>. The
              backend does not sign you in automatically after registration.
            </p>
            <Button href="/login" size="large">
              Continue to sign in
            </Button>
          </div>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
          >
            {formError ? (
              <p className="auth-form__feedback" role="alert">
                {formError}
              </p>
            ) : null}
            <Input
              label="Full name"
              type="text"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              error={fieldErrors.fullName}
              required
              disabled={submitting}
            />
            <Input
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
              required
              disabled={submitting}
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              hint="8–128 characters, with an uppercase letter, a lowercase letter, and a number."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              required
              disabled={submitting}
            />
            <Input
              label="Confirm password"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={fieldErrors.confirmPassword}
              required
              disabled={submitting}
            />
            <Button type="submit" size="large" loading={submitting}>
              Create account
            </Button>
          </form>
        )}
      </AuthPageFrame>
    </GuestOnlyRoute>
  );
}
