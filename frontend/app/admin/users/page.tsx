import { AdminShell } from "@/components/organizer/admin-shell";
import { AdminUnavailable } from "@/components/organizer/admin-unavailable";

export default function AdminUsersPage() { return <AdminShell><AdminUnavailable section="users" /></AdminShell>; }
