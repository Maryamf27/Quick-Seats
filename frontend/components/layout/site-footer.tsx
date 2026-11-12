import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-shell site-footer__grid">
        <div>
          <Link className="logo" href="/" aria-label="QuickSeats home">
            <span className="logo__mark" aria-hidden="true" />
            <span>quick<b>seats</b></span>
          </Link>
          <p>Book live events in seconds. Every seat is held for you while you pay.</p>
        </div>
        <nav aria-label="Explore">
          <h2>Explore</h2>
          <Link href="/events">All events</Link>
          <Link href="/events?category=Concert">Concerts</Link>
          <Link href="/events?category=Sports">Sports</Link>
          <Link href="/events?category=Comedy">Comedy</Link>
        </nav>
        <nav aria-label="Account">
          <h2>Your account</h2>
          <Link href="/bookings">My bookings</Link>
          <Link href="/account">Account</Link>
          <Link href="/login">Sign in</Link>
        </nav>
        <div>
          <h2>How it works</h2>
          <p>Pick seats → we hold them for 10 minutes → pay securely with Stripe → get confirmed instantly.</p>
        </div>
      </div>
      <div className="site-footer__bar">
        <div className="page-shell">© {new Date().getFullYear()} QuickSeats. Payments are in test mode.</div>
      </div>
    </footer>
  );
}
