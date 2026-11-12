"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeaderSearch } from "@/components/layout/header-search";
import { useAuth } from "@/lib/auth/auth-context";
import { SignOutButton } from "./sign-out-button";

const CATEGORIES = ["Concert", "Sports", "Comedy", "Theatre", "Festival", "Workshop"];

export function AuthHeader() {
  const { status, user } = useAuth();

  return (
    <header className="site-header">
      <div className="topbar">
        <div className="page-shell topbar__inner">
          <Link className="logo" href="/" aria-label="QuickSeats home">
            <span className="logo__mark" aria-hidden="true" />
            <span>quick<b>seats</b></span>
          </Link>
          <HeaderSearch />
          <nav className="topbar__actions" aria-label="Account">
            {status === "authenticated" && user ? (
              <>
                <Link className="topbar__link" href="/bookings">My bookings</Link>
                <Link className="topbar__link" href="/account">Hi, {user.fullName.split(" ")[0]}</Link>
                <SignOutButton size="small" variant="secondary" />
              </>
            ) : status === "unauthenticated" ? (
              <>
                <Link className="topbar__link" href="/register">Create account</Link>
                <Button href="/login" size="small">Sign in</Button>
              </>
            ) : null}
          </nav>
        </div>
      </div>
      <nav className="catbar" aria-label="Event categories">
        <div className="page-shell catbar__inner">
          <Link href="/events">All events</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/events?category=${encodeURIComponent(c)}`}>{c}</Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
