import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell app-error" role="status">
      <span className="eyebrow">404 · Not found</span>
      <h1>This page isn’t here.</h1>
      <p>The link may be out of date, or the event may no longer be available.</p>
      <div className="app-error__actions"><Link className="ui-button ui-button--primary" href="/events">Browse events</Link><Link className="ui-button ui-button--secondary" href="/">Back to QuickSeats</Link></div>
    </main>
  );
}
