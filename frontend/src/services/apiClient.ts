/**
 * The only module that calls fetch(). Components never call the API directly; they use the
 * typed services in this folder.
 */
const BASE = "/api/v1";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export type ApiFieldError = { field: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiFieldError[];

  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string | null = null,
    details: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

type Envelope = { code?: unknown; message?: unknown; request_id?: unknown; details?: unknown };

function parseDetails(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) => {
    if (d && typeof d === "object" && "field" in d && "message" in d) {
      const { field, message } = d as { field: unknown; message: unknown };
      if (typeof field === "string" && typeof message === "string") return [{ field, message }];
    }
    return [];
  });
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!SAFE.has(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "We could not reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const env = (payload ?? {}) as Envelope;
    throw new ApiError(
      response.status,
      typeof env.code === "string" ? env.code : "UNKNOWN_ERROR",
      typeof env.message === "string" ? env.message : "Something went wrong. Please try again.",
      typeof env.request_id === "string" ? env.request_id : response.headers.get("x-request-id"),
      parseDetails(env.details),
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};
