import { AuthHeader } from "@/components/auth/auth-header";
import { Button } from "@/components/ui/button";

export default function BookingCancelPage() {
  return (
    <>
      <AuthHeader />
      <main>
        <section className="page-shell booking-result">
          <h1 className="auth-page__title">Checkout cancelled</h1>
          <p className="auth-page__description">
            You left Stripe without paying. Your seats stay held until the timer runs out, then
            they&apos;re released automatically.
          </p>
          <div className="booking-result__actions">
            <Button href="/events">Back to events</Button>
            <Button href="/bookings" variant="secondary">My bookings</Button>
          </div>
        </section>
      </main>
    </>
  );
}
