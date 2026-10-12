import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/services/apiClient";

/**
 * Copies server field errors (from the error envelope's `details`) onto form fields.
 * Returns the message to show at form level, or null when every error was attached to a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  let unattached = error.details.length === 0;
  for (const detail of error.details) {
    const field = fields.find((f) => f === detail.field);
    if (field) setError(field, { type: "server", message: detail.message });
    else unattached = true;
  }
  return unattached ? error.message : null;
}
