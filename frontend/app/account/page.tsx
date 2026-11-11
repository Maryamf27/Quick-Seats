import { AccountPanel } from "@/components/auth/account-panel";
import { AuthHeader } from "@/components/auth/auth-header";
import { ProtectedRoute } from "@/components/auth/route-guards";
import Link from "next/link";

export default function AccountPage() {
  return (
    <>
      <AuthHeader />
      <div className="account-page__home-link page-shell">
        <Link href="/">Back to QuickSeats</Link>
      </div>
      <ProtectedRoute>
        <AccountPanel />
      </ProtectedRoute>
    </>
  );
}
