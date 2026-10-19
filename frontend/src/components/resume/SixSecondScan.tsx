import { CircleAlert, CircleCheck, Eye, EyeOff, Timer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/Score";
import { scanResume, SCAN_VERSION } from "@/lib/sixSecondScan";
import type { ResumeDoc } from "@/services/resumeService";
import { ResumePaper } from "./ResumePaper";

/**
 * The resume as a recruiter's first glance sees it: an F-shaped heat overlay on the page
 * (top band, then the left edge) and the checks behind it. A heuristic, labelled as one.
 */
export function SixSecondScan({ doc, editTo }: { doc: ResumeDoc; editTo: string }) {
  const [heat, setHeat] = useState(true);
  const { score, checks } = scanResume(doc);
  const failing = checks.filter((c) => !c.ok);

  return (
    <Card className="mx-auto mt-8 max-w-5xl" aria-labelledby="scan-title">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-control bg-primary-fixed text-on-primary-fixed">
          <Timer className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="scan-title" className="font-display text-headline-sm text-on-surface">Recruiter 6-second scan</h2>
          <p className="text-body-md text-on-surface-variant">
            What a recruiter's first glance lands on, based on published eye-tracking patterns. A heuristic, not a prediction.
          </p>
        </div>
        <ScoreRing value={score} size={84} label="Six-second scan" />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          <div className="relative overflow-hidden rounded-control shadow-level-2 ring-1 ring-hairline">
            <ResumePaper doc={doc} template="modern" label="Your resume with the six-second heat overlay" />
            {heat ? (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {/* Top band: name, title, latest role. Then the left edge, fading down the page. */}
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,94,58,0.42)_0%,rgba(255,170,40,0.26)_22%,rgba(255,197,66,0.08)_38%,transparent_52%)] mix-blend-multiply" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,120,40,0.30)_0%,rgba(255,170,40,0.12)_18%,transparent_34%)] mix-blend-multiply" />
                <div className="absolute inset-x-0 top-[34%] border-t-2 border-dashed border-critical/70">
                  <span className="absolute right-2 -top-3 rounded-full bg-critical px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
                    6-second line
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setHeat((h) => !h)}
            aria-pressed={heat}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-label-md text-primary hover:underline"
          >
            {heat ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {heat ? "Hide heat overlay" : "Show heat overlay"}
          </button>
        </div>

        <div>
          <p className="mb-3 text-body-md text-on-surface">
            {failing.length === 0
              ? "Everything that matters sits where the first glance lands."
              : `${failing.length} thing${failing.length === 1 ? "" : "s"} to move into the first glance.`}
          </p>
          <ul className="space-y-2.5">
            {[...failing, ...checks.filter((c) => c.ok)].map((c) => (
              <li key={c.id} className="flex gap-3 rounded-control border border-hairline bg-surface-container-low p-3">
                {c.ok ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Passed" />
                ) : (
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-label="Needs work" />
                )}
                <div className="min-w-0">
                  <p className="text-label-md font-semibold text-on-surface">{c.label}</p>
                  {!c.ok ? <p className="mt-0.5 text-body-sm text-on-surface-variant">{c.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          {failing.length ? (
            <Link to={editTo} className="mt-4 inline-flex min-h-6 items-center text-label-md font-semibold text-primary hover:underline">
              Fix these in the editor →
            </Link>
          ) : null}
          <p className="mt-4 font-mono text-label-sm text-on-surface-variant">Method {SCAN_VERSION}. Checked in your browser; nothing is sent anywhere.</p>
        </div>
      </div>
    </Card>
  );
}
