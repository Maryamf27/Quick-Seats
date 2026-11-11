export function getSafeReturnPath(path: string | null, origin: string): string {
  if (!path) {
    return "/account";
  }

  try {
    const destination = new URL(path, origin);
    if (destination.origin !== origin || !path.startsWith("/")) {
      return "/account";
    }
    if (
      destination.pathname.startsWith("/login") ||
      destination.pathname.startsWith("/register")
    ) {
      return "/account";
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/account";
  }
}
