import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth/auth-header";
import { EventDetails } from "@/components/events/event-details";

export const metadata: Metadata = {
  title: "Event details",
  description: "Event information, venue details, and current seat availability.",
};

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <>
      <AuthHeader />
      <main>
        <EventDetails eventId={eventId} />
      </main>
    </>
  );
}
