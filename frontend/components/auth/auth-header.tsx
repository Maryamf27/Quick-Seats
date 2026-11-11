"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleLabel } from "@/lib/auth/role-label";
import { SignOutButton } from "./sign-out-button";

export function AuthHeader() {
  const { status, user } = useAuth();

  return (
    <header className="site-header">
      <div className="page-shell site-header__inner">
        <Link className="wordmark" href="/" aria-label="QuickSeats home">
          quickseats
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link className="site-nav__link site-nav__link--secondary" href="/#about">
            Our point of view
          </Link>
          <Link className="site-nav__link" href="/#events">
            Discover
          </Link>
          {status === "authenticated" && user ? (
            <>
              <Badge>{getRoleLabel(user.role)}</Badge>
              <Button href="/account" size="small" variant="secondary">
                Account
              </Button>
              <SignOutButton
                size="small"
                variant="dark"
              />
            </>
          ) : status === "unauthenticated" ? (
            <>
              <Button href="/login" size="small" variant="secondary">
                Sign in
              </Button>
              <Button href="/register" size="small">
                Create account
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
