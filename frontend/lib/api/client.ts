import { ApiError, getSafeHttpErrorMessage } from "./errors";
import type { ApiErrorResponse, ApiSuccessResponse } from "./types";

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;
export const API_UNAUTHORIZED_EVENT = "quickseats:unauthorized";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ApiRequestOptions extends Omit<RequestInit, "body" | "credentials"> {
  accessToken?: string;
  query?: QueryParams;
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  code?: string;
}

function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    throw new ApiError({
      kind: "configuration",
      message: "Backend API configuration is missing.",
    });
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new ApiError({
      kind: "configuration",
      message: "Backend API configuration must be a valid URL.",
    });
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ApiError({
      kind: "configuration",
      message: "Backend API configuration must be an HTTP(S) URL without credentials or query parameters.",
    });
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (process.env.NODE_ENV === "production" && !isLoopback && url.protocol !== "https:") {
    throw new ApiError({
      kind: "configuration",
      message: "The production backend URL must use HTTPS.",
    });
  }

  return url.toString().replace(/\/+$/, "");
}

function buildUrl(path: string, query?: QueryParams): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ApiError({
      kind: "configuration",
      message: "API paths must be relative to the configured backend URL.",
    });
  }

  const url = new URL(`${getApiBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) ||
    (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) ||
    (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value))
  );
}

function getErrorEnvelope(value: unknown): ApiEnvelope<unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as ApiEnvelope<unknown>;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { accessToken, query, headers: requestHeaders, signal, ...requestOptions } = options;
  const headers = new Headers(requestHeaders);
  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    if (isFormData(body) || isBodyInit(body)) {
      requestBody = body;
    } else {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      requestBody = JSON.stringify(body);
    }
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  try {
    response = await fetch(buildUrl(path, query), {
      ...requestOptions,
      method,
      headers,
      body: requestBody,
      signal: requestSignal,
      credentials: "omit",
      cache: requestOptions.cache ?? "no-store",
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (signal?.aborted) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new ApiError({
        kind: "timeout",
        message: "The request took too long. Check your connection and try again.",
      });
    }
    if (isAbortError(error)) throw error;
    throw new ApiError({
      kind: "network",
      message: "Unable to reach the QuickSeats service. Check your connection and try again.",
    });
  }

  if (
    response.status === 401 &&
    accessToken &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
  }

  let payload: unknown;
  try {
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        if (response.ok) {
          throw new ApiError({
            kind: "response",
            status: response.status,
            message: "The service returned an invalid response.",
          });
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new ApiError({ kind: "timeout", message: "The request took too long. Check your connection and try again." });
    }
    throw new ApiError({
      kind: "response",
      status: response.status,
      message: "The service response could not be read.",
    });
  }

  const envelope = getErrorEnvelope(payload);
  if (!response.ok || envelope?.success !== true) {
    const backendMessage =
      typeof envelope?.message === "string" ? envelope.message : undefined;
    const status = response.ok ? 500 : response.status;
    const errorResponse = envelope as ApiErrorResponse | undefined;
    throw new ApiError({
      kind: "http",
      status,
      code: typeof envelope?.code === "string" ? envelope.code : null,
      details: errorResponse?.data,
      backendMessage: backendMessage ?? null,
      message: getSafeHttpErrorMessage(status, backendMessage),
    });
  }

  if (!("data" in envelope)) {
    throw new ApiError({
      kind: "response",
      status: response.status,
      message: "The service response was missing its data.",
    });
  }

  return (envelope as ApiSuccessResponse<T>).data;
}

export const api = {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>("GET", path, undefined, options);
  },
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>("POST", path, body, options);
  },
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>("PUT", path, body, options);
  },
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>("PATCH", path, body, options);
  },
  delete<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>("DELETE", path, body, options);
  },
};

export type { ApiErrorResponse, ApiSuccessResponse };
