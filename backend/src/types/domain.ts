export const USER_ROLES = ["USER", "ORGANIZER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SEAT_CATEGORIES = ["STANDARD", "PREMIUM", "VIP"] as const;
export type SeatCategory = (typeof SEAT_CATEGORIES)[number];

export const EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const SEAT_STATUSES = ["AVAILABLE", "HELD", "BOOKED"] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
