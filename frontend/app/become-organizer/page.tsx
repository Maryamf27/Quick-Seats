import { OrganizerApplicationView } from "@/components/organizer/organizer-application";
import { ProtectedRoute } from "@/components/auth/route-guards";

export default function BecomeOrganizerPage() { return <ProtectedRoute roles={["USER", "ORGANIZER"]}><OrganizerApplicationView /></ProtectedRoute>; }
