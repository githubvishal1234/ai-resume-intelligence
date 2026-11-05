import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary shadow-brand hover:bg-primary-hover active:bg-primary-active border border-transparent",
  secondary:
    "bg-surface-container-lowest text-on-surface border border-hairline-strong hover:bg-surface-container-low hover:border-outline",
  destructive:
    "bg-critical-surface text-critical-ink border border-critical-border hover:border-critical",
  ghost: "bg-transparent text-on-surface-variant border border-transparent hover:bg-surface-container-low",
};
const SIZES: Record<Size, string> = {
  md: "h-11 px-5 text-body-md gap-2",
  sm: "h-9 px-3.5 text-label-md gap-1.5",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-control font-semibold select-none whitespace-nowrap",
    // A slight press on click or tap; never on a disabled button.
    "transition-[color,background-color,border-color,box-shadow,scale] duration-150 active:scale-[0.98] aria-disabled:active:scale-100",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:pointer-events-auto",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /**
   * A button must perform a real operation or be disabled WITH an explanation. When set, the button
   * stays focusable (so the reason is reachable) but does nothing, and the reason is exposed to
   * pointer users (title) and assistive tech (description).
   */
  disabledReason?: string;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabledReason,
  icon,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: Props) {
  const inert = Boolean(disabledReason) || loading || rest.disabled;
  return (
    <button
      {...rest}
      type={type}
      title={disabledReason ?? rest.title}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={buttonClasses(variant, size, className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {disabledReason ? <span className="sr-only"> — {disabledReason}</span> : null}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...rest} className={buttonClasses(variant, size, className)} />;
}
