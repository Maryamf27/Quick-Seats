import { AuthHeader } from "@/components/auth/auth-header";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { MyBookings } from "@/components/checkout/my-bookings";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <main>
        <ProtectedRoute>
          <MyBookings />
        </ProtectedRoute>
      </main>
    </>
  );
}
