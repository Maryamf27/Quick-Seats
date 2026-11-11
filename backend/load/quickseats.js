import http from "k6/http";
import { check } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const eventId = __ENV.EVENT_ID;
const targetVus = Number(__ENV.TARGET_VUS || 10);
const duration = __ENV.DURATION || "30s";
const loginEmail = __ENV.LOGIN_EMAIL;
const loginPassword = __ENV.LOGIN_PASSWORD;
const accessToken = __ENV.ACCESS_TOKEN;
const seatIds = (__ENV.SEAT_IDS || "").split(",").filter(Boolean);
const enableCheckout = __ENV.ENABLE_CHECKOUT === "true";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    public_event_burst: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration, target: targetVus },
        { duration, target: targetVus },
        { duration: "10s", target: 0 },
      ],
    },
  },
};

export default function () {
  let token = accessToken;
  if (loginEmail && loginPassword) {
    const login = http.post(
      `${baseUrl}/api/auth/login`,
      JSON.stringify({ email: loginEmail, password: loginPassword }),
      { headers: { "content-type": "application/json" } },
    );
    check(login, {
      "login returns success or configured rate-limit response": (response) =>
        response.status === 200 || response.status === 429,
    });
    if (login.status === 200) {
      token = login.json("data.token");
    }
  }

  const listing = http.get(`${baseUrl}/api/events?limit=20`);
  check(listing, {
    "event list returns success or configured rate-limit response": (response) =>
      response.status === 200 || response.status === 429,
  });

  if (eventId) {
    const detail = http.get(`${baseUrl}/api/events/${encodeURIComponent(eventId)}`);
    check(detail, {
      "event detail returns success or configured rate-limit response": (response) =>
        response.status === 200 || response.status === 429,
    });

    const seatMap = http.get(`${baseUrl}/api/events/${encodeURIComponent(eventId)}/seats`);
    check(seatMap, {
      "seat map returns success or configured rate-limit response": (response) =>
        response.status === 200 || response.status === 429,
    });

    if (token && seatIds.length > 0) {
      const hold = http.post(
        `${baseUrl}/api/events/${encodeURIComponent(eventId)}/seats/hold`,
        JSON.stringify({ seatIds }),
        {
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
        },
      );
      check(hold, {
        "seat hold succeeds or is rejected by contention/rate limit": (response) =>
          response.status === 200 || response.status === 409 || response.status === 429,
      });

      if (enableCheckout && hold.status === 200) {
        const holdId = hold.json("data.holdId");
        const checkout = http.post(
          `${baseUrl}/api/bookings/checkout`,
          JSON.stringify({ eventId, holdId }),
          {
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
          },
        );
        check(checkout, {
          "checkout returns success, contention, or rate limit": (response) =>
            response.status === 201 || response.status === 409 || response.status === 429,
        });
      }
    }
  }
}
