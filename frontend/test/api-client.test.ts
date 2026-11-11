import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { api } from "../lib/api/client";
import { authApi } from "../lib/api/auth";
import { ApiError } from "../lib/api/errors";
import { checkBackendHealth } from "../lib/api/health";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

function successResponse<T>(data: T, message = "ok"): Response {
  return new Response(
    JSON.stringify({ success: true, message, data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("builds a prefixed URL, serializes query parameters, and unwraps success data", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return successResponse({ status: "alive" });
  };

  const result = await api.get<{ status: string }>("/health", {
    query: { page: 2, includeDrafts: false, omitted: undefined },
  });

  assert.deepEqual(result, { status: "alive" });
  assert.equal(
    requestUrl,
    "https://api.example.test/api/health?page=2&includeDrafts=false",
  );
  assert.equal(requestInit?.credentials, "omit");
  assert.equal(requestInit?.cache, "no-store");
});

test("sends a bearer token without persisting or using cookies", async () => {
  let requestHeaders: Headers | undefined;
  let credentials: RequestCredentials | undefined;
  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    credentials = init?.credentials;
    return successResponse({ _id: "user-1" });
  };

  await api.get<{ _id: string }>("/auth/me", { accessToken: "request-token" });

  assert.equal(requestHeaders?.get("Authorization"), "Bearer request-token");
  assert.equal(credentials, "omit");
});

test("registration uses the actual public registration fields and response", async () => {
  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body);
    return new Response(
      JSON.stringify({
        success: true,
        message: "User registered successfully",
        data: {
          _id: "user-1",
          fullName: "Taylor Quick",
          email: "taylor@example.test",
          role: "USER",
          createdAt: "2026-11-11T00:00:00.000Z",
          updatedAt: "2026-11-11T00:00:00.000Z",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const user = await authApi.register({
    fullName: "Taylor Quick",
    email: "taylor@example.test",
    password: "Asecure123",
  });

  assert.equal(requestUrl, "https://api.example.test/api/auth/register");
  assert.deepEqual(JSON.parse(requestBody) as unknown, {
    fullName: "Taylor Quick",
    email: "taylor@example.test",
    password: "Asecure123",
  });
  assert.equal(user.role, "USER");
  assert.equal("token" in user, false);
});

test("login consumes the backend's bearer-token response", async () => {
  globalThis.fetch = async (_input, init) => {
    assert.equal(String(init?.body), JSON.stringify({
      email: "taylor@example.test",
      password: "Asecure123",
    }));
    return successResponse({
      token: "short-lived-access-token",
      user: {
        _id: "user-1",
        fullName: "Taylor Quick",
        email: "taylor@example.test",
        role: "USER",
        createdAt: "2026-11-11T00:00:00.000Z",
        updatedAt: "2026-11-11T00:00:00.000Z",
      },
    });
  };

  const result = await authApi.login({
    email: "taylor@example.test",
    password: "Asecure123",
  });

  assert.equal(result.token, "short-lived-access-token");
  assert.equal(result.user.role, "USER");
});

test("serializes JSON bodies and preserves caller-provided headers", async () => {
  let requestHeaders: Headers | undefined;
  let requestBody: BodyInit | null | undefined;
  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    requestBody = init?.body;
    return successResponse({ _id: "user-1" });
  };

  await api.post("/auth/login", { email: "person@example.test", password: "A1secret" }, {
    headers: { "X-Request-Source": "test", Accept: "application/problem+json" },
  });

  assert.equal(requestHeaders?.get("Content-Type"), "application/json");
  assert.equal(requestHeaders?.get("Accept"), "application/problem+json");
  assert.equal(requestHeaders?.get("X-Request-Source"), "test");
  assert.equal(
    requestBody,
    JSON.stringify({ email: "person@example.test", password: "A1secret" }),
  );
});

test("maps unauthorized responses to a safe ApiError", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: false, message: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(
    api.get("/auth/me"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === "Please sign in to continue." &&
      error.backendMessage === "Invalid or expired token",
  );
});

test("does not expose backend 500 details as the display message", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: false, message: "database stack detail" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(
    api.get("/events"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 500 &&
      error.message === "The service is temporarily unavailable. Please try again.",
  );
});

test("represents network failures without leaking the underlying fetch error", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("internal network detail");
  };

  await assert.rejects(
    api.get("/events"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.kind === "network" &&
      !error.message.includes("internal network detail"),
  );
});

test("reports missing configuration without issuing a request", async () => {
  delete process.env.NEXT_PUBLIC_API_URL;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return successResponse({});
  };

  const result = await checkBackendHealth();

  assert.equal(result.status, "configuration_missing");
  assert.equal(result.apiReachable, false);
  assert.equal(requestCount, 0);
});

test("reports health-check timeouts", async () => {
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true },
      );
    });

  const result = await checkBackendHealth({ timeoutMs: 1 });
  assert.equal(result.status, "timed_out");
  assert.equal(result.apiReachable, false);
});

test("preserves readiness diagnostics from the backend readiness endpoint", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        message: "Application is not ready",
        data: {
          status: "not_ready",
          database: "connected",
          cacheRedis: "disconnected",
          workerRedis: "connected",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );

  const result = await checkBackendHealth({ readiness: true });

  assert.equal(result.status, "unavailable");
  assert.equal(result.endpoint, "/health/ready");
  assert.equal(result.apiReachable, true);
  assert.equal(result.readiness?.cacheRedis, "disconnected");
});

test("does not set JSON content type for FormData", async () => {
  let requestHeaders: Headers | undefined;
  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    return successResponse({ uploaded: true });
  };

  const form = new FormData();
  form.set("file", new Blob(["sample"]), "sample.txt");
  await api.post<{ uploaded: boolean }>("/uploads", form);

  assert.equal(requestHeaders?.has("Content-Type"), false);
});
