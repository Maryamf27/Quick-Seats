export type UserRole = "USER" | "ORGANIZER" | "ADMIN";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type SeatCategory = "STANDARD" | "PREMIUM" | "VIP";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";
export type RefundStatus = "NOT_REQUIRED" | "PENDING" | "SUCCEEDED" | "FAILED";

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  data?: unknown;
}

export type ValidationErrorResponse = ApiErrorResponse;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

export interface SafeUser {
  _id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResult {
  token: string;
  user: SafeUser;
}

export interface VenueAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface VenueSection {
  name: string;
  rows: number;
  seatsPerRow: number;
  seatCategory: SeatCategory;
  price: number;
}

export interface Venue {
  _id: string;
  name: string;
  description: string;
  address: VenueAddress;
  capacity: number;
  sections: VenueSection[];
  createdAt: string;
  updatedAt: string;
}

export interface EventVenueSummary {
  _id: string;
  name: string;
  description?: string;
  address: VenueAddress;
  capacity?: number;
}

export interface EventRecord {
  _id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  venueId: string | EventVenueSummary;
  organizerId: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  posterUrl?: string;
  startingPrice?: number | null;
  currency?: string;
  seatsGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventListResult {
  events: EventRecord[];
  categories: string[];
  pagination: Pagination;
}

export interface VenueListResult {
  venues: Venue[];
  pagination: Pagination;
}

export interface SeatSummary {
  total: number;
  available: number;
  held: number;
  booked: number;
}

export interface EventSeat {
  id: string;
  section: string;
  row: string;
  seatNumber: number;
  category: SeatCategory;
  price: number;
  status: SeatStatus;
}

export interface SeatMapResult {
  eventId: string;
  summary: SeatSummary;
  overallSummary: SeatSummary;
  seats: EventSeat[];
  pagination: Pagination;
}

export interface SeatGenerationResult {
  eventId: string;
  totalSeats: number;
  sections: number;
}

export interface SeatHoldResult {
  holdId: string;
  eventId: string;
  userId: string;
  seatIds: string[];
  createdAt: string;
  expiresAt: string;
}

export interface SeatReleaseResult {
  holdId: string;
  eventId: string;
  releasedCount: number;
}

export interface EventSeatSummary {
  id: string;
  section: string;
  row: string;
  seatNumber: number;
  category: SeatCategory;
  price: number;
}

export interface BookingEventSummary {
  title: string;
  startDate: string;
  endDate: string;
}

export interface BookingSummary {
  id: string;
  eventId: string;
  seatIds: string[];
  totalAmount: number;
  currency: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  requiresRefund: boolean;
  refundStatus: RefundStatus;
  createdAt: string;
}

export interface BookingDetail extends BookingSummary {
  event: BookingEventSummary | null;
  seats: EventSeatSummary[];
}

export interface MyBooking {
  id: string;
  eventId: string;
  event: BookingEventSummary | null;
  seats: EventSeatSummary[];
  totalAmount: number;
  currency: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface BookingListResult {
  bookings: MyBooking[];
  pagination: Pagination;
}

export interface BookingStatusResult {
  bookingId: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  requiresRefund: boolean;
  refundStatus: RefundStatus;
  paidAt: string | null;
}

export interface CheckoutResult {
  bookingId: string;
  checkoutUrl: string;
  status: "PENDING";
  expiresAt: string;
}

export interface OrganizerEventSales {
  eventId: string;
  title: string;
  category: string;
  startDate: string;
  bookings: number;
  ticketsSold: number;
  revenueByCurrency: Record<string, number>;
}

export interface OrganizerSalesSummary {
  from: string;
  to: string;
  eventCount: number;
  totalBookings: number;
  totalTicketsSold: number;
  revenueByCurrency: Record<string, number>;
  events: OrganizerEventSales[];
}

export type OrganizerReportStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface OrganizerReport {
  _id: string;
  organizerId: string;
  from: string;
  to: string;
  status: OrganizerReportStatus;
  result?: OrganizerSalesSummary;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResult {
  status: "alive";
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  database: "connected" | "disconnected";
  cacheRedis: "connected" | "disconnected" | "not_configured";
  workerRedis: "connected" | "disconnected" | "not_configured";
}

export interface OrganizerReportQueued {
  reportId: string;
  status: OrganizerReportStatus;
}

export type OrganizerApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface OrganizerApplication {
  _id: string;
  userId: string | { _id: string; fullName: string; email: string; createdAt?: string };
  businessName: string;
  description: string;
  status: OrganizerApplicationStatus;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerEventListResult {
  events: EventRecord[];
  pagination: Pagination;
}

export interface AdminUser extends SafeUser {
  isSuspended?: boolean;
}

export interface AdminOrganizer extends AdminUser {
  businessName: string | null;
  eventCount: number;
  publishedEventCount: number;
}

export interface AdminOverviewResult {
  users: number;
  organizers: number;
  suspendedUsers: number;
  pendingApplications: number;
  events: number;
  publishedEvents: number;
  bookings: number;
  confirmedBookings: number;
  ticketsSold: number;
  revenueByCurrency: Record<string, number>;
}

export interface AdminEventRow {
  _id: string;
  title: string;
  category: string;
  status: EventStatus;
  startDate: string;
  organizerId: { _id: string; fullName: string; email: string } | string;
  venueId: { _id: string; name: string; address?: { city?: string } } | string;
}

export interface AdminBookingRow {
  id: string;
  user: { _id: string; fullName: string; email: string } | string | null;
  event: { _id: string; title: string; startDate: string } | string | null;
  ticketCount: number;
  totalAmount: number;
  currency: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  requiresRefund: boolean;
  refundStatus: RefundStatus;
  createdAt: string;
}

export interface AdminAnalyticsResult {
  from: string;
  to: string;
  dailySales: { day: string; currency: string | null; bookings: number; tickets: number; revenue: number }[];
  bookingsByStatus: Record<string, number>;
  topEvents: { eventId: string; title: string; category: string | null; bookings: number; tickets: number; revenue: number; currency: string | null }[];
  categories: { category: string; events: number }[];
  userGrowth: { day: string; users: number }[];
}

export interface OrganizerBookingRow {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string | null;
  customerName: string;
  ticketCount: number;
  seats: { section: string; row: string; seatNumber: number; category: SeatCategory }[];
  totalAmount: number;
  currency: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}
