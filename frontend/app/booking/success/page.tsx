import { AuthHeader } from "@/components/auth/auth-header";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { BookingStatus } from "@/components/checkout/booking-status";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <main>
        <ProtectedRoute>
          <BookingStatus />
        </ProtectedRoute>
      </main>
    </>
  );
}
