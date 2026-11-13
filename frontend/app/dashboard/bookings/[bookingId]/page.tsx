import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { BookingDetailView } from "@/components/dashboard/booking-detail";

export default function DashboardBookingDetailPage() {
  return <ProtectedRoute roles={["USER", "ADMIN"]}><DashboardShell><BookingDetailView /></DashboardShell></ProtectedRoute>;
}
