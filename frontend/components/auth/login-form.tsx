"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { getSafeReturnPath } from "@/lib/auth/navigation";
import { validateLogin } from "@/lib/auth/validation";
import type { LoginFieldErrors } from "@/lib/auth/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPageFrame, GuestOnlyRoute } from "./route-guards";

function getLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "The email or password you entered is incorrect.";
    }
    return error.message;
  }
  return "We couldn’t sign you in. Please try again.";
}

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(getSafeReturnPath(next, window.location.origin));
    } catch (error: unknown) {
      setFormError(getLoginError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GuestOnlyRoute>
      <AuthPageFrame
        eyebrow="Welcome back"
        title="Come on in."
        description="Sign in to pick up where your next great night begins."
        footer={
          <p>
            New to QuickSeats? <Link href="/register">Create an account</Link>
          </p>
        }
      >
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {formError ? (
            <p className="auth-form__feedback" role="alert">
              {formError}
            </p>
          ) : null}
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
            disabled={submitting}
          />
          <Button type="submit" size="large" loading={submitting}>
            Sign in
          </Button>
        </form>
      </AuthPageFrame>
    </GuestOnlyRoute>
  );
}
