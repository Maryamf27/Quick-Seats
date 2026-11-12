import { AdminShell } from "@/components/organizer/admin-shell";
import { AdminUnavailable } from "@/components/organizer/admin-unavailable";

export default function AdminEventsPage() { return <AdminShell><AdminUnavailable section="events" /></AdminShell>; }
