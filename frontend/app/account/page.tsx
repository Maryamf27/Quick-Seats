import { AccountPanel } from "@/components/auth/account-panel";
import { AuthHeader } from "@/components/auth/auth-header";
import { ProtectedRoute } from "@/components/auth/route-guards";

export default function AccountPage() {
  return (
    <>
      <AuthHeader />
      <ProtectedRoute>
        <AccountPanel />
      </ProtectedRoute>
    </>
  );
}
