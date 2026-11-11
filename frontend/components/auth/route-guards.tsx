"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { getSafeReturnPath } from "@/lib/auth/navigation";
import type { UserRole } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: readonly UserRole[];
}) {
  const { status, user, refreshSession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname || "/account");
      router.replace(`/login?next=${next}`);
    }
  }, [pathname, router, status]);

  if (status === "loading") {
    return <LoadingState label="Checking your sign-in…" />;
  }
  if (status === "unavailable") {
    return (
      <ErrorState
        title="We couldn’t verify your session"
        description="Reconnect to the service and try checking your sign-in again."
        onRetry={() => void refreshSession()}
      />
    );
  }
  if (status === "unauthenticated" || !user) {
    return <LoadingState label="Taking you to sign in…" />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <section className="page-shell auth-access-denied" role="alert">
        <span className="eyebrow">Access restricted</span>
        <h1 className="auth-page__title">This page isn’t available to your account.</h1>
        <p className="auth-page__description">
          Your account does not have the role required for this area.
        </p>
        <Button href="/account">Return to your account</Button>
      </section>
    );
  }
  return children;
}

export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(getSafeReturnPath(next, window.location.origin));
    }
  }, [router, status, user]);

  if (status === "loading") {
    return <LoadingState label="Checking your sign-in…" />;
  }
  if (status === "unavailable") {
    return (
      <div className="page-shell auth-availability">
        <ErrorState
          title="Sign-in is temporarily unavailable"
          description="We couldn’t verify whether you are already signed in. Try again when the service is available."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (status === "authenticated") {
    return <LoadingState label="Opening your account…" />;
  }
  return children;
}

export function AuthPageFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-page__shell">
        <section className="auth-page__story" aria-label="QuickSeats">
          <Link className="wordmark" href="/" aria-label="QuickSeats home">
            quickseats
          </Link>
          <div className="auth-page__story-copy">
            <span className="eyebrow">Make room for a good night</span>
            <p className="auth-page__story-heading">
              Good things happen when you <em>show up.</em>
            </p>
            <p className="auth-page__story-note">
              A thoughtful way to make plans, find your people, and be there
              for the moments that matter.
            </p>
          </div>
          <span className="auth-page__story-caption">QuickSeats · Live, together</span>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__form-wrap">
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="auth-page__title">{title}</h1>
            <p className="auth-page__description">{description}</p>
            {children}
            <div className="auth-page__footer">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
