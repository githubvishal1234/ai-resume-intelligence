import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-control border bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-placeholder " +
  "transition-colors focus:border-primary focus:shadow-focus focus:outline-none disabled:bg-surface-container-low disabled:text-on-surface-variant";

type FieldShell = { label: string; hint?: string; error?: string | undefined; children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode };

export function Field({ label, hint, error, children }: FieldShell) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-label-md text-on-surface">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: Ref<HTMLInputElement> };
export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-10", invalid ? "border-critical" : "border-hairline", className)}
    />
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };
export function Textarea({ invalid, className, ...rest }: AreaProps) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "min-h-32 py-2.5", invalid ? "border-critical" : "border-hairline", className)}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; ref?: Ref<HTMLSelectElement> };
export function Select({ invalid, className, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-10", invalid ? "border-critical" : "border-hairline", className)}
    />
  );
}
