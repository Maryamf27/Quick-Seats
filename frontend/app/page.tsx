import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-header";
import { EventDiscovery } from "@/components/events/event-discovery";
import { HeroCarousel } from "@/components/events/hero-carousel";
import { fallbackBackground } from "@/lib/events/poster";

const CATEGORIES = ["Concert", "Sports", "Comedy", "Theatre", "Festival", "Workshop"];

export default function Home() {
  return (
    <>
      <AuthHeader />
      <main>
        <HeroCarousel />
        <section className="page-shell home-section" aria-label="Recommended events" id="events">
          <EventDiscovery home />
        </section>
        <section className="page-shell home-section" aria-labelledby="home-cats-title">
          <h2 className="home-section__title" id="home-cats-title">Browse by category</h2>
          <div className="category-tiles">
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                className="category-tile"
                href={`/events?category=${encodeURIComponent(c)}`}
                style={{ background: fallbackBackground(c) }}
              >
                <span>{c}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
