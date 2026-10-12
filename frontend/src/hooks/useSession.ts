import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/services/apiClient";
import { authService, type LoginInput, type RegisterInput, type SessionInfo } from "@/services/authService";

export const SESSION_KEY = ["session"] as const;

/** `data === null` means "not signed in" (a normal state, not an error). */
export function useSession() {
  return useQuery<SessionInfo | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await authService.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authService.login(input),
    onSuccess: (session) => client.setQueryData(SESSION_KEY, session),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authService.register(input),
    onSuccess: (session) => client.setQueryData(SESSION_KEY, session),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      // Drop every cached user-specific query, then mark the session as signed out.
      client.clear();
      client.setQueryData(SESSION_KEY, null);
    },
  });
}
