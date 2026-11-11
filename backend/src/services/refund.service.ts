import { Types } from "mongoose";
import { stripe } from "../config/stripe.js";
import { BookingModel } from "../models/booking.model.js";
import { AppError } from "../utils/app-error.js";

export async function retryBookingRefund(bookingId: string): Promise<void> {
  const booking = await BookingModel.findOne({
    _id: new Types.ObjectId(bookingId),
    requiresRefund: true,
    refundStatus: { $in: ["PENDING", "FAILED"] },
    paymentStatus: "PAID",
  }).exec();

  if (!booking || !booking.stripePaymentIntentId) {
    return;
  }

  const paymentIntentId = booking.stripePaymentIntentId;
  await BookingModel.updateOne(
    { _id: booking._id, stripePaymentIntentId: paymentIntentId },
    {
      $set: { refundStatus: "PENDING" },
      $inc: { refundAttempts: 1 },
      $currentDate: { refundLastAttemptAt: true },
    },
  ).exec();

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      paymentIntent.id !== paymentIntentId ||
      paymentIntent.status !== "succeeded" ||
      paymentIntent.metadata.bookingId !== booking._id.toString() ||
      paymentIntent.metadata.holdId !== booking.holdId
    ) {
      throw new AppError("Payment Intent is not eligible for this booking refund", 409);
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        metadata: {
          bookingId: booking._id.toString(),
          holdId: booking.holdId ?? "",
        },
      },
      { idempotencyKey: `quickseats-refund-${booking._id.toString()}` },
    );
    const refundStatus = refund.status === "succeeded"
      ? "SUCCEEDED"
      : refund.status === "pending"
        ? "PENDING"
        : "FAILED";

    await BookingModel.updateOne(
      { _id: booking._id, stripePaymentIntentId: paymentIntentId },
      {
        $set: {
          refundStatus,
          stripeRefundId: refund.id,
          ...(refundStatus === "SUCCEEDED" ? { paymentStatus: "REFUNDED" } : {}),
        },
      },
    ).exec();
    if (refundStatus === "FAILED") {
      throw new AppError("Stripe could not complete the refund", 502);
    }
  } catch (error: unknown) {
    await BookingModel.updateOne(
      {
        _id: booking._id,
        stripePaymentIntentId: paymentIntentId,
        refundStatus: { $ne: "SUCCEEDED" },
      },
      { $set: { refundStatus: "FAILED" } },
    ).exec();
    throw error;
  }
}

export async function retryPendingBookingRefunds(): Promise<void> {
  const retryBefore = new Date(Date.now() - 5 * 60_000);
  const bookings = await BookingModel.find({
    requiresRefund: true,
    paymentStatus: "PAID",
    refundStatus: { $in: ["PENDING", "FAILED"] },
    $or: [
      { refundLastAttemptAt: { $exists: false } },
      { refundLastAttemptAt: { $lte: retryBefore } },
    ],
  })
    .select("_id")
    .limit(50)
    .lean()
    .exec();

  for (const booking of bookings) {
    try {
      await retryBookingRefund(booking._id.toString());
    } catch (error: unknown) {
      console.error("Booking refund retry failed", {
        bookingId: booking._id.toString(),
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
