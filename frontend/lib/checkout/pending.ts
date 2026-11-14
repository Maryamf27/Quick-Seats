// Stripe's success_url only carries ?session_id=..., not our booking id, so we
// remember the booking we just sent to Stripe. We use localStorage (not
// sessionStorage) so the id survives the cross-origin Stripe redirect, which
// some browsers' tracking prevention can wipe from sessionStorage.
const KEY = "quickseats.pendingBookingId";

function migrateFromSessionStorage(): string | null {
  try {
    const legacy = window.sessionStorage.getItem(KEY);
    if (!legacy) {
      return null;
    }
    window.localStorage.setItem(KEY, legacy);
    window.sessionStorage.removeItem(KEY);
    return legacy;
  } catch {
    return null;
  }
}

export function savePendingBookingId(bookingId: string): void {
  try {
    window.localStorage.setItem(KEY, bookingId);
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the success page falls back to session_id / "My bookings".
  }
}

export function readPendingBookingId(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? migrateFromSessionStorage();
  } catch {
    return null;
  }
}

export function clearPendingBookingId(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isSafeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("stripe.com");
  } catch {
    return false;
  }
}

export function readCheckoutSessionId(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get("session_id");
    if (!value || !value.startsWith("cs_")) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
