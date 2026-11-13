import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "../src/services/email.service.js";
import {
  renderSalesSummaryEmail,
  type UpcomingEventSales,
} from "../src/services/sales-summary-email.service.js";

const event: UpcomingEventSales = {
  eventId: "64b000000000000000000001",
  title: "Rock <script>alert(1)</script> Night",
  startDate: new Date("2026-11-16T19:00:00.000Z"),
  bookings: 3,
  ticketsSold: 7,
  seatsTotal: 20,
  seatsBooked: 7,
  revenueByCurrency: { usd: 350.5 },
};

test("sales summary email lists sales, revenue and seat fill per event", () => {
  const email = renderSalesSummaryEmail("Ada", 7, [event]);
  assert.match(email.subject, /1 event in the next 7 days/);
  assert.match(email.text, /7 tickets in 3 bookings/);
  assert.match(email.text, /350\.50 USD/);
  assert.match(email.text, /7\/20 seats booked \(35%\)/);
});

test("sales summary email escapes event titles in the HTML body", () => {
  const email = renderSalesSummaryEmail("Ada", 7, [event]);
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;"));
});

test("sales summary email handles events with no sales", () => {
  const email = renderSalesSummaryEmail("Ada", 7, [
    { ...event, bookings: 0, ticketsSold: 0, seatsBooked: 0, revenueByCurrency: {} },
  ]);
  assert.match(email.text, /0 tickets in 0 bookings/);
  assert.match(email.text, /Revenue: 0\.00/);
});

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
