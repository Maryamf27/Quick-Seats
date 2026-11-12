import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateLogin,
  validateRegistration,
} from "../lib/auth/validation";
import { getSafeReturnPath } from "../lib/auth/navigation";

test("accepts registration values that meet the backend password rules", () => {
  assert.deepEqual(
    validateRegistration({
      fullName: "Taylor Quick",
      email: "taylor@example.test",
      password: "Asecure123",
      confirmPassword: "Asecure123",
    }),
    {},
  );
});

test("rejects registration values that violate backend validation", () => {
  const errors = validateRegistration({
    fullName: "T",
    email: "not-an-email",
    password: "alllowercase",
    confirmPassword: "different",
  });

  assert.equal(errors.fullName, "Name must be between 2 and 120 characters.");
  assert.equal(errors.email, "Enter a valid email address.");
  assert.equal(errors.password, "Password must contain an uppercase letter.");
  assert.equal(errors.confirmPassword, "Passwords do not match.");
});

test("accepts login email and non-empty password", () => {
  assert.deepEqual(
    validateLogin({ email: "taylor@example.test", password: "secret" }),
    {},
  );
});

test("rejects missing or malformed login values", () => {
  assert.deepEqual(validateLogin({ email: "bad", password: " " }), {
    email: "Enter a valid email address.",
    password: "Enter your password.",
  });
});

test("preserves only safe same-origin return destinations", () => {
  const origin = "https://quickseats.example";

  assert.equal(
    getSafeReturnPath("/account?tab=profile#details", origin),
    "/account?tab=profile#details",
  );
  assert.equal(getSafeReturnPath("https://attacker.example", origin), "/dashboard");
  assert.equal(getSafeReturnPath("//attacker.example/path", origin), "/dashboard");
  assert.equal(getSafeReturnPath("/login?next=/account", origin), "/dashboard");
  assert.equal(getSafeReturnPath(null, origin), "/dashboard");
  assert.equal(getSafeReturnPath(null, origin, "ORGANIZER"), "/organizer/dashboard");
  assert.equal(getSafeReturnPath(null, origin, "ADMIN"), "/admin/dashboard");
});
