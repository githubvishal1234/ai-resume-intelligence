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

function signOutLocally(client: ReturnType<typeof useQueryClient>) {
  // Mark the session as signed out, then drop every other cached user-specific query.
  // (clear() would also remove the session query and make mounted guards refetch /auth/me.)
  void client.cancelQueries({ queryKey: SESSION_KEY });
  client.setQueryData(SESSION_KEY, null);
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => authService.logout(),
    // Only show "signed out" once the server confirmed it (or the session was already gone);
    // otherwise the server session would stay valid while the UI claims it ended.
    onSuccess: () => signOutLocally(client),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) signOutLocally(client);
    },
  });
}
