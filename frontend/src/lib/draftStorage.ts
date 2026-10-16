/**
 * Unsaved quick-builder drafts, kept in this browser so a half-finished resume survives a
 * reload or a closed tab. Keys are per user; every draft is removed on save and on sign-out,
 * so a shared computer does not keep someone's resume after they leave. Storage may be
 * unavailable (private mode, blocked site data), so every call tolerates failure.
 */
const PREFIX = "resume-intel:draft:";

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not fatal: the builder still works, the draft just isn't kept.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function clearAllDrafts(): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).filter(
      (k): k is string => k !== null && k.startsWith(PREFIX),
    );
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
