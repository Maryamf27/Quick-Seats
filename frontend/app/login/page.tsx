import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const params = await searchParams;
  return <LoginForm sessionExpired={params.reason === "session-expired"} />;
}
