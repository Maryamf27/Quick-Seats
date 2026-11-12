import Link from "next/link";
import { AdminShell } from "@/components/organizer/admin-shell";

export default function AdminDashboardPage() { return <AdminShell><section className="organizer-section"><span className="eyebrow">Administration</span><h1>Admin dashboard</h1><p>Review pending organizer access requests.</p><Link href="/admin/organizer-applications">Organizer applications →</Link></section></AdminShell>; }
