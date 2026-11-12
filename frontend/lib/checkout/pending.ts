// Stripe's success_url only carries ?session_id=..., not our booking id, so we
// remember the booking we just sent to Stripe in this tab's sessionStorage.
const KEY = "quickseats.pendingBookingId";

export function savePendingBookingId(bookingId: string): void {
  try {
    window.sessionStorage.setItem(KEY, bookingId);
  } catch {
    // Storage can be blocked; the success page falls back to "My bookings".
  }
}

export function readPendingBookingId(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingBookingId(): void {
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
