"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { bookingsApi } from "@/lib/api/endpoints/bookings";
import type { BookingDetail } from "@/lib/api/types";
import { longDate } from "@/lib/events/poster";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";

export function BookingDetailView() {
  const { bookingId } = useParams<{ bookingId: string }>(); const { accessToken } = useAuth(); const { notify } = useToast(); const [cancelling, setCancelling] = useState(false); const [now] = useState(() => Date.now());
  const [loaded, setLoaded] = useState<{ id: string; booking: BookingDetail } | null>(null); const [error, setError] = useState<{ id: string; error: ApiError } | null>(null); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    bookingsApi.get(bookingId, accessToken, { signal: controller.signal }).then((booking) => { setLoaded({ id: bookingId, booking }); setError(null); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError({ id: bookingId, error: reason instanceof ApiError ? reason : new ApiError({ kind: "response", message: "Booking details could not be loaded." }) }); });
    return () => controller.abort();
  }, [accessToken, bookingId, retry]);
  const currentError = error?.id === bookingId ? error.error : null;
  if (currentError) {
    const unavailable = currentError.status === 403 || currentError.status === 404;
    return <ErrorState title={unavailable ? "Booking unavailable" : "Couldn’t load this booking"} description={unavailable ? "This booking could not be found for your account." : currentError.message} onRetry={unavailable ? undefined : () => { setError(null); setRetry((n) => n + 1); }} />;
  }
  if (!loaded || loaded.id !== bookingId) return <LoadingState label="Loading booking details…" />;
  const booking = loaded.booking;
  const confirmed = booking.status === "CONFIRMED" && booking.paymentStatus === "PAID";
  const canCancel = confirmed && Boolean(booking.event) && new Date(booking.event!.startDate).getTime() > now;
  async function cancelBooking() {
    if (!accessToken || cancelling) return;
    if (!window.confirm("Cancel this booking? Your seats will be released and the payment refunded to your original payment method.")) return;
    setCancelling(true);
    try {
      const result = await bookingsApi.cancel(bookingId, accessToken);
      setLoaded({ id: bookingId, booking: { ...booking, status: result.status, paymentStatus: result.paymentStatus, refundStatus: result.refundStatus, requiresRefund: result.requiresRefund } });
      notify(result.paymentStatus === "REFUNDED" ? "Booking cancelled and refunded." : "Booking cancelled. Your refund is being processed.", "success");
    } catch (reason: unknown) {
      notify(reason instanceof ApiError && reason.backendMessage ? reason.backendMessage : "The booking could not be cancelled.", "error");
    } finally {
      setCancelling(false);
    }
  }
  const refundNote = booking.status === "CANCELLED" && booking.requiresRefund ? (booking.refundStatus === "SUCCEEDED" || booking.paymentStatus === "REFUNDED" ? "This booking was cancelled and the payment has been refunded." : "This booking was cancelled. Your refund is being processed and will reach your original payment method shortly.") : null;
  let price = ""; try { price = new Intl.NumberFormat(undefined, { style: "currency", currency: (booking.currency ?? "USD").toUpperCase() }).format(booking.totalAmount); } catch { price = String(booking.totalAmount); }
  return <section className="booking-detail"><Link href="/dashboard/bookings" className="dashboard-back">← Back to bookings</Link><span className="eyebrow">Booking details</span><div className="dashboard-heading"><div><h1>{booking.event?.title ?? "Event details unavailable"}</h1><p>{booking.event ? longDate(booking.event.startDate) : "Event date unavailable"}</p></div><Badge tone={confirmed ? "success" : booking.status === "PENDING" ? "warning" : "danger"}>{booking.status}</Badge></div>
    <div className="booking-detail__grid"><article><h2>Booking summary</h2><dl className="booking-detail__rows"><div><dt>Booking reference</dt><dd>{booking.id}</dd></div><div><dt>Booking status</dt><dd>{booking.status}</dd></div><div><dt>Payment status</dt><dd>{booking.paymentStatus}</dd></div><div><dt>Booked on</dt><dd>{new Date(booking.createdAt).toLocaleString()}</dd></div><div><dt>Tickets</dt><dd>{booking.seats.length}</dd></div><div><dt>Total</dt><dd>{price}</dd></div></dl></article><article><h2>Seats</h2>{booking.seats.length ? <ul className="booking-seat-list">{booking.seats.map((seat) => <li key={seat.id}><span>{seat.section} · Row {seat.row} · Seat {seat.seatNumber}</span><span>{seat.category} · {priceCurrency(seat.price, booking.currency)}</span></li>)}</ul> : <p>Seat details are unavailable.</p>}<p className="dashboard-note">Venue, event image, and location are not included in the booking details supplied by the service.</p></article></div>{refundNote ? <p className="dashboard-note">{refundNote}</p> : null}<div className="organizer-actions"><Button href="/dashboard/bookings" variant="secondary">All bookings</Button>{canCancel ? <Button variant="destructive" loading={cancelling} onClick={() => void cancelBooking()}>Cancel booking</Button> : null}</div></section>;
}
function priceCurrency(value: number, currency: string | null) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency ?? "USD").toUpperCase() }).format(value); } catch { return String(value); } }
