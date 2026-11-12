import { AdminShell } from "@/components/organizer/admin-shell";
import { AdminUnavailable } from "@/components/organizer/admin-unavailable";

export default function AdminOrganizersPage() { return <AdminShell><AdminUnavailable section="organizers" /></AdminShell>; }
