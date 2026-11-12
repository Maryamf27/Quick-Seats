import { AdminShell } from "@/components/organizer/admin-shell";
import { AdminUnavailable } from "@/components/organizer/admin-unavailable";

export default function AdminBookingsPage() { return <AdminShell><AdminUnavailable section="bookings" /></AdminShell>; }
