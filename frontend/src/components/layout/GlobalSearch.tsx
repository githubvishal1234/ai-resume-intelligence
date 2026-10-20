import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, FileSignature, FileText, Hammer, Search, Telescope, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/services/apiClient";
import type { components } from "@/types/api";
import { cn } from "@/lib/cn";

type Hit = components["schemas"]["SearchHit"];
type Kind = Hit["kind"];

const KINDS: Record<Kind, { label: string; icon: LucideIcon; to: (id: string) => string }> = {
  resume: { label: "Resumes", icon: FileText, to: (id) => `/resumes/${id}` },
  job: { label: "Jobs", icon: Telescope, to: (id) => `/jobs/${id}` },
  application: { label: "Applications", icon: BriefcaseBusiness, to: (id) => `/applications/${id}` },
  cover_letter: { label: "Cover letters", icon: FileSignature, to: (id) => `/cover-letters/${id}` },
  proof: { label: "Proof Board", icon: Hammer, to: () => "/proofs" },
};

/** Debounces a value so typing does not send a request per keystroke. */
function useDebounced(value: string, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Header search over the user's own resumes (titles and text), jobs, applications, cover letters
 * and proof tasks. A combobox: arrows move, Enter opens, Escape closes, Ctrl/Cmd+K or "/" focuses.
 */
export function GlobalSearch() {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const id = useId();
  const q = useDebounced(text.trim());
  const results = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<components["schemas"]["SearchOut"]>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });
  const hits = q.length >= 2 ? (results.data?.hits ?? []) : [];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: Hit) => {
    setOpen(false);
    setText("");
    input.current?.blur();
    navigate(KINDS[hit.kind].to(hit.id));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
      if (!text) input.current?.blur();
    }
  };

  const showPanel = open && text.trim().length >= 2;
  const groups = (Object.keys(KINDS) as Kind[]).map((k) => ({ kind: k, items: hits.filter((h) => h.kind === k) })).filter((g) => g.items.length);
  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div className="relative ml-auto hidden w-full max-w-sm md:ml-0 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder" aria-hidden />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search your resumes, jobs, applications and letters"
        aria-expanded={showPanel}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && hits[active] ? optionId(active) : undefined}
        placeholder="Search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-control border border-hairline bg-surface-container-low pl-9 pr-14 text-body-md text-on-surface placeholder:text-placeholder focus:border-primary focus:bg-surface-container-lowest focus:shadow-focus focus:outline-none"
      />
      {text ? null : (
        <kbd aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-hairline-strong px-1.5 font-mono text-label-sm text-on-surface-variant">
          Ctrl K
        </kbd>
      )}
      {showPanel ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70dvh] overflow-y-auto rounded-card border border-hairline bg-surface-container-lowest p-2 shadow-level-3">
          <ul id={`${id}-list`} role="listbox" aria-label="Search results">
            {groups.map((g) => {
              const { label, icon: Icon } = KINDS[g.kind];
              return (
                <li key={g.kind} role="presentation">
                  <p className="px-2 pb-1 pt-2 text-label-sm uppercase tracking-wide text-on-surface-variant" aria-hidden>
                    {label}
                  </p>
                  <ul role="group" aria-label={label}>
                    {g.items.map((h) => {
                      const i = hits.indexOf(h);
                      return (
                        <li
                          key={`${h.kind}-${h.id}`}
                          id={optionId(i)}
                          role="option"
                          aria-selected={i === active}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => go(h)}
                          onMouseEnter={() => setActive(i)}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5",
                            i === active ? "bg-primary-fixed text-on-primary-fixed" : "text-on-surface",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-body-md">{h.title}</span>
                            <span className={cn("block truncate text-body-sm", i === active ? "text-on-primary-fixed" : "text-on-surface-variant")}>
                              {h.subtitle}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          {hits.length === 0 ? (
            <p role="status" className="px-2 py-3 text-body-md text-on-surface-variant">
              {results.isFetching || text.trim() !== q ? "Searching…" : results.isError ? "Search failed. Try again." : `Nothing matches “${q}”.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
