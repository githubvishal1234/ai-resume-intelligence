import type { components } from "@/types/api";
import { api, setCsrfToken } from "./apiClient";

export type SessionInfo = components["schemas"]["SessionOut"];
export type RegisterInput = components["schemas"]["RegisterRequest"];
export type LoginInput = components["schemas"]["LoginRequest"];
export type AuthOptions = components["schemas"]["AuthOptionsOut"];
export type ResetConfirmInput = components["schemas"]["PasswordResetConfirm"];

function remember(session: SessionInfo): SessionInfo {
  setCsrfToken(session.csrf_token);
  return session;
}

export const authService = {
  me: async () => remember(await api.get<SessionInfo>("/auth/me")),
  login: async (input: LoginInput) => remember(await api.post<SessionInfo>("/auth/login", input)),
  register: async (input: RegisterInput) =>
    remember(await api.post<SessionInfo>("/auth/register", input)),
  logout: async () => {
    await api.post<void>("/auth/logout");
    setCsrfToken(null);
  },
  options: () => api.get<AuthOptions>("/auth/options"),
  requestReset: (email: string) => api.post<Record<string, never>>("/auth/password-reset/request", { email }),
  confirmReset: (input: ResetConfirmInput) => api.post<void>("/auth/password-reset/confirm", input),
};
