const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);
const TWO_DECIMAL_COMPATIBILITY_CURRENCIES = new Set(["isk"]);

export function currencyExponent(currency: string): number {
  const normalized = currency.toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) {
    return 0;
  }
  if (THREE_DECIMAL_CURRENCIES.has(normalized)) {
    return 3;
  }
  if (TWO_DECIMAL_COMPATIBILITY_CURRENCIES.has(normalized)) {
    return 2;
  }
  return 2;
}

export function toMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative finite number");
  }

  const normalized = currency.toLowerCase();
  const exponent = currencyExponent(normalized);
  const multiplier = 10 ** exponent;
  const minorUnits = Math.round((amount + Number.EPSILON) * multiplier);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(amount)) * 4;

  if (!Number.isSafeInteger(minorUnits) || Math.abs(amount - minorUnits / multiplier) > tolerance) {
    throw new Error(`Amount cannot be represented in ${normalized.toUpperCase()} minor units`);
  }
  if (normalized === "isk" && minorUnits % 100 !== 0) {
    throw new Error("ISK amounts must be whole units");
  }
  if (normalized === "ugx" && minorUnits % 100 !== 0) {
    throw new Error("UGX amounts must be whole units");
  }

  return minorUnits;
}

export function fromMinorUnits(amount: number, currency: string): number {
  return amount / 10 ** currencyExponent(currency);
}
