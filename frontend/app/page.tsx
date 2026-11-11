import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-header";
import { EventDiscovery } from "@/components/events/event-discovery";
import { EventSearchForm } from "@/components/events/event-search-form";

export default function Home() {
  return (
    <>
      <AuthHeader />
      <main>
        <section className="page-shell discovery-hero" id="about">
          <div className="discovery-hero__copy">
            <span className="eyebrow">Make room for a good night</span>
            <h1 className="discovery-hero__title">
              Find your next <em>unforgettable experience.</em>
            </h1>
            <p className="discovery-hero__description">
              Discover live events, find a night that feels like yours, and be
              there when it happens.
            </p>
            <EventSearchForm />
            <Link className="discovery-hero__browse" href="/events">
              Browse all events
            </Link>
          </div>
          <p className="discovery-hero__aside">
            The best nights aren’t watched from the sidelines.
          </p>
        </section>

        <section
          className="page-shell events-home"
          id="events"
          aria-labelledby="home-events-title"
        >
          <h2 className="visually-hidden" id="home-events-title">
            Upcoming events
          </h2>
          <EventDiscovery home />
        </section>
      </main>
      <footer className="site-footer">
        <div className="page-shell site-footer__inner">
          <Link className="wordmark" href="/" aria-label="QuickSeats home">
            quickseats
          </Link>
          <span>Good things happen when you show up.</span>
        </div>
      </footer>
    </>
  );
}
