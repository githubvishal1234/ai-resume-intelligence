import type { components } from "@/types/api";
import { api, setCsrfToken } from "./apiClient";

export type AccountUser = components["schemas"]["UserOut"];
export type SignIn = components["schemas"]["SignInOut"];
export type Revoked = components["schemas"]["RevokedOut"];
export type PasswordChangeInput = components["schemas"]["PasswordChange"];
export type ProWaitlist = components["schemas"]["ProWaitlistOut"];

export const accountService = {
  updateProfile: (display_name: string) => api.patch<AccountUser>("/account", { display_name }),
  changePassword: (input: PasswordChangeInput) => api.post<Revoked>("/account/password", input),
  signIns: () => api.get<SignIn[]>("/account/sign-ins"),
  revoke: (id: string) => api.delete<void>(`/account/sign-ins/${id}`),
  revokeOthers: () => api.post<Revoked>("/account/sign-ins/revoke-others"),
  deleteAccount: async (password: string) => {
    await api.post<void>("/account/delete", { password });
    setCsrfToken(null);
  },
  proWaitlist: () => api.get<ProWaitlist>("/account/pro-waitlist"),
  joinProWaitlist: () => api.post<ProWaitlist>("/account/pro-waitlist"),
};
