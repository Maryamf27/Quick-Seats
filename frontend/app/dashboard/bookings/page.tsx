import { Suspense } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BookingHistory } from "@/components/dashboard/booking-history";
import { LoadingState } from "@/components/ui/states";

export default function DashboardBookingsPage() {
  return <ProtectedRoute roles={["USER", "ADMIN"]}><DashboardShell><Suspense fallback={<LoadingState label="Loading your bookings…" />}><BookingHistory /></Suspense></DashboardShell></ProtectedRoute>;
}
