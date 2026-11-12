import { AdminOverview } from "@/components/organizer/admin-overview";
import { AdminShell } from "@/components/organizer/admin-shell";

export default function AdminDashboardPage() {
  return <AdminShell><AdminOverview /></AdminShell>;
}
