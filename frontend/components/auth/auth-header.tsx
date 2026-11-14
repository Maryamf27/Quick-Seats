"use client";

import Link from "next/link";
import { useState } from "react";
import { HeaderSearch } from "@/components/layout/header-search";
import { useAuth } from "@/lib/auth/auth-context";
import { AccountMenu } from "./account-menu";
import { SignInLink } from "./sign-in-link";

const CATEGORIES = ["Concert", "Sports", "Comedy", "Theatre", "Festival", "Workshop"];

export function AuthHeader() {
  const { status, user } = useAuth();
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false);

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
            <button className="topbar__menu-toggle" type="button" aria-expanded={mobileCategoriesOpen} aria-controls="event-category-navigation" onClick={() => setMobileCategoriesOpen((open) => !open)}>
              {mobileCategoriesOpen ? "Close menu" : "Browse"}
            </button>
            {status === "authenticated" && user ? (
              <>
                {user.role === "USER" ? <Link className="topbar__link" href="/dashboard/bookings">My bookings</Link> : null}
                <AccountMenu />
              </>
            ) : status === "unauthenticated" ? (
              <>
                <Link className="topbar__link" href="/register">Create account</Link>
                <SignInLink asButton size="small" />
              </>
            ) : null}
          </nav>
        </div>
      </div>
      <nav id="event-category-navigation" className={`catbar${mobileCategoriesOpen ? " catbar--open" : ""}`} aria-label="Event categories">
        <div className="page-shell catbar__inner">
          <Link href="/events" onClick={() => setMobileCategoriesOpen(false)}>All events</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/events?category=${encodeURIComponent(c)}`} onClick={() => setMobileCategoriesOpen(false)}>{c}</Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
