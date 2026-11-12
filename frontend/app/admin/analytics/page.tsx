import { AdminShell } from "@/components/organizer/admin-shell";
import { AdminUnavailable } from "@/components/organizer/admin-unavailable";

export default function AdminAnalyticsPage() { return <AdminShell><AdminUnavailable section="analytics" /></AdminShell>; }
