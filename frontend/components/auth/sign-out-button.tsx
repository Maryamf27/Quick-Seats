"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";

export function SignOutButton({
  size = "medium",
  variant = "secondary",
}: {
  size?: "small" | "medium";
  variant?: "dark" | "secondary";
}) {
  const { signOut } = useAuth();
  const { notify } = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    setSubmitting(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      notify(
        "You have been signed out on this device. The service could not confirm the logout.",
        "warning",
      );
      router.replace("/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      loading={submitting}
      onClick={() => void handleSignOut()}
    >
      Sign out
    </Button>
  );
}
