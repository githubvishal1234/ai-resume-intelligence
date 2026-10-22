import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePref } from "@/lib/theme";

/** Header button: flips between light and dark. Settings > Appearance also offers "System". */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPref } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn("rounded-control p-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface", className)}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

/** System / Light / Dark radio group, for Settings. */
export function ThemeChoice() {
  const { pref, setPref } = useTheme();
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {OPTIONS.map(({ id, label, icon: Icon }) => (
          <label
            key={id}
            className={cn(
              "relative flex cursor-pointer flex-col items-center gap-1.5 rounded-control border px-3 py-3 text-label-md transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
              pref === id ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-hairline-strong text-on-surface-variant hover:border-outline",
            )}
          >
            <input type="radio" name={name} value={id} checked={pref === id} onChange={() => setPref(id)} className="sr-only" />
            <Icon className="size-5" aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
