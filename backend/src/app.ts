import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { eventRouter } from "./routes/event.routes.js";
import { seatHoldRouter } from "./routes/seat-hold.routes.js";
import { venueRouter } from "./routes/venue.routes.js";
import { bookingRouter } from "./routes/booking.routes.js";
import { paymentRouter } from "./routes/payment.routes.js";
import { globalRateLimit } from "./middlewares/rate-limit.middleware.js";
import { organizerReportRouter } from "./routes/organizer-report.routes.js";
import { organizerApplicationRouter } from "./routes/organizer-application.routes.js";

const app = express();

app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use("/api/payments", paymentRouter);
app.use(express.json());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

app.use("/api", healthRouter);
app.use("/api", globalRateLimit);
app.use("/api", authRouter);
app.use("/api", organizerReportRouter);
app.use("/api", organizerApplicationRouter);
app.use("/api", venueRouter);
app.use("/api", eventRouter);
app.use("/api", seatHoldRouter);
app.use("/api/bookings", bookingRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
