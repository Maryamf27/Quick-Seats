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

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", venueRouter);
app.use("/api", eventRouter);
app.use("/api", seatHoldRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
