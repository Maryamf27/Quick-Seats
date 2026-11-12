"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("QuickSeats application error", error); }, [error]);
  return (
    <html lang="en"><body>
      <main className="page-shell app-error" role="alert">
        <span className="eyebrow">QuickSeats</span>
        <h1>QuickSeats is having trouble loading.</h1>
        <p>Your booking and payment status is always confirmed by our service. Please retry or reload the page.</p>
        <button className="ui-button ui-button--primary" type="button" onClick={reset}>Try again</button>
      </main>
    </body></html>
  );
}
