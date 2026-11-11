import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth/auth-header";
import { EventDiscovery } from "@/components/events/event-discovery";

export const metadata: Metadata = {
  title: "Explore events",
  description: "Search and filter published QuickSeats events.",
};

export default function EventsPage() {
  return (
    <>
      <AuthHeader />
      <main className="page-shell events-page">
        <EventDiscovery />
      </main>
    </>
  );
}
