import { AuthHeader } from "@/components/auth/auth-header";
import { EventDiscovery } from "@/components/events/event-discovery";

export default function Home() {
  return (
    <>
      <AuthHeader />
      <main>
        <section className="page-shell home-section" aria-label="Recommended events" id="events">
          <EventDiscovery home />
        </section>
      </main>
    </>
  );
}
