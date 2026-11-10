import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyExponent, fromMinorUnits, toMinorUnits } from "../src/utils/currency.js";

test("Stripe amounts use currency-specific minor units", () => {
  assert.equal(toMinorUnits(1250, "pkr"), 125000);
  assert.equal(toMinorUnits(125, "jpy"), 125);
  assert.equal(toMinorUnits(1.234, "bhd"), 1234);
  assert.equal(toMinorUnits(10, "isk"), 1000);
  assert.equal(toMinorUnits(100, "ugx"), 100);
  assert.equal(fromMinorUnits(1234, "bhd"), 1.234);
  assert.equal(currencyExponent("jpy"), 0);
  assert.equal(currencyExponent("pkr"), 2);
});

test("Stripe amount conversion rejects unsupported precision and unsafe values", () => {
  assert.throws(() => toMinorUnits(1.001, "pkr"), /cannot be represented/);
  assert.throws(() => toMinorUnits(1.25, "jpy"), /cannot be represented/);
  assert.throws(() => toMinorUnits(100.01, "ugx"), /minor units/);
  assert.throws(() => toMinorUnits(Number.MAX_SAFE_INTEGER, "bhd"), /cannot be represented/);
});
