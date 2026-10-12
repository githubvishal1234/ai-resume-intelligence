import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Drops a deleted item's cached query once no screen uses it any more.
 *
 * Removing it while its page is still mounted makes that page fetch it again (a 404 for
 * something the user just deleted) before the navigation away completes.
 */
export function forgetDeleted(client: QueryClient, queryKey: QueryKey): void {
  const cache = client.getQueryCache();
  const query = cache.find({ queryKey, exact: true });
  if (!query) return;
  void client.cancelQueries({ queryKey, exact: true });
  if (query.getObserversCount() === 0) {
    cache.remove(query);
    return;
  }
  const unsubscribe = cache.subscribe((event) => {
    if (event.query === query && event.type === "observerRemoved" && query.getObserversCount() === 0) {
      unsubscribe();
      cache.remove(query);
    }
  });
}
