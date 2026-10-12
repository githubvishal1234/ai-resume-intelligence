import { afterEach, describe, expect, it } from "vitest";
import { ApiError, request, setCsrfToken } from "./apiClient";
import { mockApi } from "@/test/utils";

afterEach(() => setCsrfToken(null));

describe("apiClient", () => {
  it("adds the CSRF header only on unsafe methods", async () => {
    const { calls } = mockApi([
      { path: "/x", body: { ok: true } },
      { method: "POST", path: "/x", body: { ok: true } },
    ]);
    setCsrfToken("tok");
    await request("GET", "/x");
    await request("POST", "/x", { a: 1 });
    expect(calls[0]?.headers["X-CSRF-Token"]).toBeUndefined();
    expect(calls[1]?.headers["X-CSRF-Token"]).toBe("tok");
  });

  it("turns the error envelope into an ApiError", async () => {
    mockApi([
      {
        path: "/bad",
        status: 422,
        body: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", request_id: "rid-1", details: [{ field: "email", message: "bad" }, { nope: 1 }] },
      },
    ]);
    const error = await request("GET", "/bad").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(422);
    expect(api.code).toBe("VALIDATION_ERROR");
    expect(api.requestId).toBe("rid-1");
    expect(api.details).toEqual([{ field: "email", message: "bad" }]);
  });

  it("falls back to the response request id when the body is not JSON", async () => {
    mockApi([]);
    globalThis.fetch = (async () => new Response("<html>", { status: 502, headers: { "x-request-id": "hdr-id" } })) as typeof fetch;
    const error = (await request("GET", "/gw").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.requestId).toBe("hdr-id");
  });

  it("reports network failures with a friendly message", async () => {
    mockApi([]);
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const error = (await request("GET", "/down").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });
});
