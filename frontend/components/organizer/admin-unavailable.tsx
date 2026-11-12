import Link from "next/link";

const details: Record<string, { title: string; description: string; dependency: string }> = {
  users: {
    title: "User management",
    description: "The backend has no administrator endpoint for listing or searching users, viewing account details, or managing account status.",
    dependency: "An ADMIN-protected, paginated user directory with safe user fields and supported account-management actions is required.",
  },
  organizers: {
    title: "Organizer management",
    description: "The backend supports reviewing organizer applications, but it has no directory or management endpoints for approved organizers, event counts, activity, or suspension.",
    dependency: "An ADMIN-protected organizer directory and supported organizer detail and status operations are required.",
  },
  events: {
    title: "Event management",
    description: "The existing event list is public and visibility-filtered, while organizer event lists are scoped to the authenticated owner. There is no platform-wide admin event listing.",
    dependency: "An ADMIN-protected, paginated event directory including owner and publication status is required before platform event management can be shown.",
  },
  bookings: {
    title: "Booking management",
    description: "The existing booking list is scoped to the authenticated customer. There is no platform-wide administrator booking list or filter API.",
    dependency: "An ADMIN-protected booking directory with permitted customer, event, organizer, ticket, payment, and pagination fields is required.",
  },
  analytics: {
    title: "Platform analytics",
    description: "There are no platform-wide aggregation endpoints for booking or revenue trends, ticket sales, event popularity, category distribution, organizer performance, or user growth.",
    dependency: "Administrator-scoped aggregate analytics endpoints are required. Organizer sales reports are restricted to an organizer’s own events and cannot represent platform totals.",
  },
};

export function AdminUnavailable({ section }: { section: keyof typeof details }) {
  const item = details[section];
  return (
    <section className="organizer-section admin-unavailable">
      <header className="organizer-heading"><div><span className="eyebrow">Administration</span><h1>{item.title}</h1><p>{item.description}</p></div></header>
      <article className="admin-api-note"><span className="admin-api-note__label">Backend dependency</span><p>{item.dependency}</p></article>
      {section === "organizers" ? <Link className="admin-inline-link" href="/admin/organizer-applications">Review organizer applications <span aria-hidden="true">→</span></Link> : null}
    </section>
  );
}
