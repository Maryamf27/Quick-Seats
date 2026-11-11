import type { UserRole } from "@/lib/api/types";

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "ORGANIZER":
      return "Organizer";
    case "ADMIN":
      return "Administrator";
    case "USER":
      return "Member";
  }
}
