export type ApiErrorKind =
  | "configuration"
  | "network"
  | "timeout"
  | "http"
  | "response";

export interface ApiErrorOptions {
  kind: ApiErrorKind;
  status?: number | null;
  code?: string | null;
  details?: unknown;
  backendMessage?: string | null;
  message: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: unknown;
  readonly backendMessage: string | null;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.details = options.details;
    this.backendMessage = options.backendMessage ?? null;
  }
}

export function getSafeHttpErrorMessage(
  status: number,
  backendMessage?: string,
): string {
  if (status >= 500) {
    return "The service is temporarily unavailable. Please try again.";
  }

  switch (status) {
    case 400:
      return backendMessage || "The request could not be understood.";
    case 401:
      return "Please sign in to continue.";
    case 403:
      return "You don’t have permission to do that.";
    case 404:
      return "The requested information could not be found.";
    case 409:
      return backendMessage || "This request conflicts with the current state.";
    case 422:
      return backendMessage || "Please check the information and try again.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    default:
      return backendMessage || "The request could not be completed.";
  }
}
