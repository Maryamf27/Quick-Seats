"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("QuickSeats route error", error); }, [error]);
  return (
    <main className="page-shell app-error" role="alert">
      <span className="eyebrow">Something went wrong</span>
      <h1>We couldn’t load this page.</h1>
      <p>Please try again. If the problem continues, return to QuickSeats and try another page.</p>
      <div className="app-error__actions"><button className="ui-button ui-button--primary" type="button" onClick={reset}>Try again</button><Link className="ui-button ui-button--secondary" href="/">Back to QuickSeats</Link></div>
    </main>
  );
}
