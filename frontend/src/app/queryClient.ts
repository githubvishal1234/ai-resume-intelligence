import { QueryCache, QueryClient } from "@tanstack/react-query";
import { SESSION_KEY } from "@/hooks/useSession";
import { ApiError } from "@/services/apiClient";

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // A 401 anywhere means the session ended: send the user back to sign-in.
        if (error instanceof ApiError && error.code === "AUTH_REQUIRED" && query.queryKey[0] !== "session") {
          client.setQueryData(SESSION_KEY, null);
        }
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
  return client;
}
