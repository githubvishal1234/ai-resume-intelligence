import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import { createQueryClient } from "@/app/queryClient";
import { createTestRouter } from "@/app/router";

export type MockRoute = { method?: string; path: string; status?: number; body?: unknown };

/** Requests the app shell makes on every page; a test can override them by listing the path. */
const SHELL_ROUTES: MockRoute[] = [{ path: "/notifications/unread-count", body: { unread: 0 } }];

/** Replaces fetch with a tiny router over `/api/v1` paths. Unmatched calls fail loudly. */
export function mockApi(given: MockRoute[]) {
  const routes = [...given, ...SHELL_ROUTES];
  const calls: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      method,
      path,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const route = routes.find((r) => r.path === path && (r.method ?? "GET") === method);
    if (!route) throw new Error(`Unmocked request: ${method} ${path}`);
    const status = route.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(route.body === undefined ? {} : route.body), {
      status,
      headers: { "content-type": "application/json", "x-request-id": "req-test-123" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export function renderApp(path: string) {
  const router = createTestRouter(path);
  const client = createQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, client };
}

export const USER = { id: "8b6f3d2e-0000-4000-8000-000000000001", email: "ada@example.com", display_name: "Ada Lovelace" };
export const SESSION = { user: USER, csrf_token: "csrf-abc" };
export const NOT_AUTHED = { status: 401, body: { code: "AUTH_REQUIRED", message: "Authentication is required.", request_id: "r1" } };
export const CAPS = {
  ai: { configured: false, provider: null, model: null, reason: "LLM_PROVIDER is not set." },
  email: { configured: false },
  storage: { backend: "local" },
  benchmarks: { available: false },
  job_sources: { external_adapters: [] },
};
