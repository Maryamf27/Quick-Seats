export function getRoleHome(role: "USER" | "ORGANIZER" | "ADMIN"): string {
  if (role === "ORGANIZER") return "/organizer/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/";
}

export function getLoginHref(currentPath: string): string {
  if (
    !currentPath.startsWith("/") ||
    currentPath.startsWith("//") ||
    currentPath === "/" ||
    currentPath.startsWith("/login") ||
    currentPath.startsWith("/register")
  ) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(currentPath)}`;
}

export function getSafeReturnPath(path: string | null, origin: string, role: "USER" | "ORGANIZER" | "ADMIN" = "USER"): string {
  if (!path) {
    return getRoleHome(role);
  }

  try {
    const destination = new URL(path, origin);
    if (destination.origin !== origin || !path.startsWith("/")) {
      return getRoleHome(role);
    }
    if (
      destination.pathname.startsWith("/login") ||
      destination.pathname.startsWith("/register")
    ) {
      return getRoleHome(role);
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return getRoleHome(role);
  }
}
