import { ApiError } from "./errors";
import { api } from "./client";
import type { HealthResult, ReadinessResult } from "./types";

export type HealthCheckStatus =
  | "connected"
  | "unavailable"
  | "configuration_missing"
  | "timed_out";

export interface HealthCheckResult {
  status: HealthCheckStatus;
  endpoint: "/health" | "/health/ready";
  apiReachable: boolean;
  readiness?: ReadinessResult;
}

export interface HealthCheckOptions {
  readiness?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function getReadinessDetails(details: unknown): ReadinessResult | undefined {
  if (
    typeof details !== "object" ||
    details === null ||
    !("status" in details) ||
    !("database" in details) ||
    !("cacheRedis" in details) ||
    !("workerRedis" in details)
  ) {
    return undefined;
  }
  if (
    (details.status === "ready" || details.status === "not_ready") &&
    (details.database === "connected" || details.database === "disconnected") &&
    (details.cacheRedis === "connected" ||
      details.cacheRedis === "disconnected" ||
      details.cacheRedis === "not_configured") &&
    (details.workerRedis === "connected" ||
      details.workerRedis === "disconnected" ||
      details.workerRedis === "not_configured")
  ) {
    return {
      status: details.status,
      database: details.database,
      cacheRedis: details.cacheRedis,
      workerRedis: details.workerRedis,
    };
  }
  return undefined;
}

export async function checkBackendHealth(
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const endpoint = options.readiness ? "/health/ready" : "/health";
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000,
  );
  const abortFromCaller = () => controller.abort();

  if (options.signal?.aborted) {
    clearTimeout(timeout);
    throw options.signal.reason ?? new Error("Health check was cancelled.");
  }
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    if (options.readiness) {
      const readiness = await api.get<ReadinessResult>(endpoint, {
        signal: controller.signal,
      });
      return {
        status: readiness.status === "ready" ? "connected" : "unavailable",
        endpoint,
        apiReachable: true,
        readiness,
      };
    }

    await api.get<HealthResult>(endpoint, { signal: controller.signal });
    return { status: "connected", endpoint, apiReachable: true };
  } catch (error: unknown) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Health check was cancelled.");
    }
    if (controller.signal.aborted) {
      return {
        status: "timed_out",
        endpoint,
        apiReachable: false,
      };
    }
    if (error instanceof ApiError && error.kind === "configuration") {
      return {
        status: "configuration_missing",
        endpoint,
        apiReachable: false,
      };
    }
    return {
      status: "unavailable",
      endpoint,
      apiReachable: error instanceof ApiError && error.kind === "http",
      ...(options.readiness && error instanceof ApiError
        ? { readiness: getReadinessDetails(error.details) }
        : {}),
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
