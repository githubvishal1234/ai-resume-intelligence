import { ArrowRight, BarChart3, FileSignature, Hammer, Map as MapIcon, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CardHeader } from "@/components/ui/Card";
import { useLetterList } from "@/hooks/useCoverLetters";
import { useMarket, useOutcomes, useProofs } from "@/hooks/useInsights";

const pct = (r: number | null | undefined) => (r == null ? "–" : `${Math.round(r * 100)}%`);

type Tile = { to: string; icon: LucideIcon; label: string; value: string; detail: string; empty: boolean };

/** Live numbers from Callback Insights, the Market Map, the Proof Board and cover letters. */
export function AtAGlance() {
  const outcomes = useOutcomes();
  const market = useMarket();
  const proofs = useProofs();
  const letters = useLetterList();
  const loading = "Loading…";

  const o = outcomes.data;
  const m = market.data;
  const p = proofs.data ?? [];
  const done = p.filter((x) => x.status === "done").length;
  const proven = p.filter((x) => x.evidence_status === "strong").length;
  const l = letters.data ?? [];

  const tiles: Tile[] = [
    {
      to: o?.total.sent ? "/insights" : "/applications/new",
      icon: BarChart3,
      label: "Reply rate",
      value: o ? (o.total.sent ? pct(o.total.response_rate) : "–") : "…",
      detail: !o ? loading : o.total.sent ? `${o.total.responded} of ${o.total.sent} sent got a reply` : "Track an application to start",
      empty: !o?.total.sent,
    },
    {
      to: m?.jobs_analyzed ? "/market" : "/jobs/new",
      icon: MapIcon,
      label: "Market coverage",
      value: m ? (m.coverage != null ? pct(m.coverage) : "–") : "…",
      detail: !m ? loading : !m.jobs_analyzed ? "Save a job posting to start" : m.top_gap ? `Biggest gap: ${m.top_gap.name}` : `Across ${m.jobs_analyzed} saved jobs`,
      empty: !m?.jobs_analyzed,
    },
    {
      to: "/proofs",
      icon: Hammer,
      label: "Proof Board",
      value: proofs.data ? (p.length ? `${done}/${p.length}` : "–") : "…",
      detail: !proofs.data ? loading : p.length ? `${proven} now shown on your resume` : "Turn a skill gap into a plan",
      empty: !p.length,
    },
    {
      to: "/cover-letters",
      icon: FileSignature,
      label: "Cover letters",
      value: letters.data ? String(l.length || "–") : "…",
      detail: !letters.data ? loading : l.length ? `Latest: ${l[0]!.title}` : "Draft one from a saved job",
      empty: !l.length,
    },
  ];

  return (
    <section aria-labelledby="glance-title">
      <CardHeader id="glance-title" title="At a glance" description="Where your search stands, from your own data." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ to, icon: Icon, label, value, detail, empty }) => (
          <li key={label} className="group relative rounded-card border border-hairline bg-surface-container-lowest p-4 shadow-level-1 transition hover:-translate-y-0.5 hover:border-primary-fixed-dim hover:shadow-level-2">
            <div className="flex items-center justify-between gap-2 text-label-sm uppercase tracking-wide text-on-surface-variant">
              <span>{label}</span>
              <Icon className="size-4" aria-hidden />
            </div>
            <Link to={to} className="tnum mt-2 block font-display text-headline-lg text-on-surface after:absolute after:inset-0 group-hover:text-primary">
              {value}
              <span className="sr-only">{` ${label}: ${detail}`}</span>
            </Link>
            <p className="mt-1 flex items-center gap-1 truncate text-body-sm text-on-surface-variant" aria-hidden>
              <span className="truncate">{detail}</span>
              {empty ? <ArrowRight className="size-3.5 shrink-0" /> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
