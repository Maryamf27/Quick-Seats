import { AuthHeader } from "@/components/auth/auth-header";
import { EventDiscovery } from "@/components/events/event-discovery";
import { HeroCarousel } from "@/components/events/hero-carousel";

export default function Home() {
  return (
    <>
      <AuthHeader />
      <main>
        <HeroCarousel />
        <section className="page-shell home-section" aria-label="Recommended events" id="events">
          <EventDiscovery home />
        </section>
      </main>
    </>
  );
}
