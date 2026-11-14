import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OrganizerApplicationView } from "@/components/organizer/organizer-application";
import { ProtectedRoute } from "@/components/auth/route-guards";

export default function BecomeOrganizerPage() {
  return (
    <ProtectedRoute roles={["USER", "ORGANIZER"]}>
      <DashboardShell>
        <OrganizerApplicationView />
      </DashboardShell>
    </ProtectedRoute>
  );
}
