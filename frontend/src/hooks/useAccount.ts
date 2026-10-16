import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountService, type PasswordChangeInput } from "@/services/accountService";
import type { SessionInfo } from "@/services/authService";
import { SESSION_KEY, signOutLocally } from "./useSession";

const SIGN_INS_KEY = ["account", "sign-ins"] as const;

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => accountService.updateProfile(displayName),
    onSuccess: (user) =>
      client.setQueryData<SessionInfo | null>(SESSION_KEY, (s) => (s ? { ...s, user } : s)),
  });
}

export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PasswordChangeInput) => accountService.changePassword(input),
    onSuccess: () => client.invalidateQueries({ queryKey: SIGN_INS_KEY }),
  });
}

export function useSignIns() {
  return useQuery({ queryKey: SIGN_INS_KEY, queryFn: accountService.signIns });
}

export function useRevokeSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountService.revoke(id),
    onSuccess: () => client.invalidateQueries({ queryKey: SIGN_INS_KEY }),
  });
}

export function useRevokeOtherSignIns() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => accountService.revokeOthers(),
    onSuccess: () => client.invalidateQueries({ queryKey: SIGN_INS_KEY }),
  });
}

const PRO_WAITLIST_KEY = ["account", "pro-waitlist"] as const;

/** Only asked when signed in; signed-out visitors see the sign-up path instead. */
export function useProWaitlist(enabled: boolean) {
  return useQuery({ queryKey: PRO_WAITLIST_KEY, queryFn: accountService.proWaitlist, enabled });
}

export function useJoinProWaitlist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => accountService.joinProWaitlist(),
    onSuccess: (state) => client.setQueryData(PRO_WAITLIST_KEY, state),
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => accountService.deleteAccount(password),
    onSuccess: () => signOutLocally(client),
  });
}
