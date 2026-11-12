"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/route-guards";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AdminShell({ children }: { children: ReactNode }) { return <ProtectedRoute roles={["ADMIN"]}><main className="admin-shell page-shell"><header><Link href="/" className="organizer-brand">quickseats<span>.</span></Link><nav><Link href="/admin/dashboard">Admin</Link><Link href="/admin/organizer-applications">Organizer applications</Link><SignOutButton size="small" /></nav></header>{children}</main></ProtectedRoute>; }
