import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReportRange } from "../src/services/organizer-report.service.js";

test("organizer report defaults to the preceding 30 days", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const range = normalizeReportRange(undefined, undefined, now);
  assert.equal(range.to, now);
  assert.equal(range.from.toISOString(), "2026-10-11T12:00:00.000Z");
});

test("organizer report validates range order and maximum duration", () => {
  assert.throws(
    () =>
      normalizeReportRange(
        new Date("2026-02-01T00:00:00.000Z"),
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    /start date must be before its end date/,
  );
  assert.throws(
    () =>
      normalizeReportRange(
        new Date("2024-01-01T00:00:00.000Z"),
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    /cannot exceed 366 days/,
  );
});
