import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
} from "../src/validators/admin.validator.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "../src/validators/auth.validator.js";

test("admin user updates may only grant USER or ORGANIZER and must change something", () => {
  assert.equal(adminUpdateUserSchema.safeParse({ role: "ORGANIZER" }).success, true);
  assert.equal(adminUpdateUserSchema.safeParse({ isSuspended: true }).success, true);
  assert.equal(adminUpdateUserSchema.safeParse({ role: "ADMIN" }).success, false);
  assert.equal(adminUpdateUserSchema.safeParse({}).success, false);
  assert.equal(adminUpdateUserSchema.safeParse({ role: "USER", extra: 1 }).success, false);
});

test("admin user list query coerces pagination and rejects unknown filters", () => {
  const parsed = adminListUsersQuerySchema.parse({ page: "2", suspended: "true" });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.suspended, true);
  assert.equal(adminListUsersQuerySchema.safeParse({ role: "ROOT" }).success, false);
  assert.equal(adminListUsersQuerySchema.safeParse({ bogus: "1" }).success, false);
});

test("profile updates accept only a valid full name", () => {
  assert.equal(updateProfileSchema.safeParse({ fullName: "  Ada Lovelace " }).success, true);
  assert.equal(updateProfileSchema.safeParse({ fullName: "A" }).success, false);
  assert.equal(updateProfileSchema.safeParse({ fullName: "Ada", role: "ADMIN" }).success, false);
});

test("password change enforces strength and a different new password", () => {
  const ok = { currentPassword: "OldPassw0rd", newPassword: "NewPassw0rd" };
  assert.equal(changePasswordSchema.safeParse(ok).success, true);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: "weak" }).success, false);
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: "SamePassw0rd", newPassword: "SamePassw0rd" }).success,
    false,
  );
});

import { organizerBookingsQuerySchema } from "../src/validators/organizer-booking.validator.js";

test("organizer booking query validates filters and rejects unknown keys", () => {
  const parsed = organizerBookingsQuerySchema.parse({ page: "3", status: "CONFIRMED" });
  assert.equal(parsed.page, 3);
  assert.equal(parsed.limit, 20);
  assert.equal(organizerBookingsQuerySchema.safeParse({ status: "PAID" }).success, false);
  assert.equal(organizerBookingsQuerySchema.safeParse({ eventId: "nope" }).success, false);
  assert.equal(organizerBookingsQuerySchema.safeParse({ userId: "x" }).success, false);
});
