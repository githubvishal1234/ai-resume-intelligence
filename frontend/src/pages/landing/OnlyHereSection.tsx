import { BarChart3, CircleCheck, Hammer, Map as MapIcon, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { PHOTOS, photoSrcSet, type PhotoName } from "@/constants/images";
import { cn } from "@/lib/cn";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

/** Product-page section for the four features no other resume tool has. Illustrations only. */
export function OnlyHereSection({ eyebrow, h2 }: { eyebrow: string; h2: string }) {
  return (
    <section id="only-here" aria-labelledby="only-here-title" className="scroll-mt-20 bg-ink-deep py-24 text-on-ink">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className={cn(eyebrow, "text-accent")}>Only here</p>
          <h2 id="only-here-title" className={cn(h2, "mt-3")}>
            Not just a better resume. <span className="text-accent">Proof of what works.</span>
          </h2>
          <p className="mt-4 text-body-lg text-on-ink-muted">
            Four tools built on your own data and plain rules, not guesswork: see which resume gets replies, what your market
            really asks for, how to close a gap with real evidence, and what a recruiter sees first.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <Tile photo="insights" className="lg:col-span-2" icon={<BarChart3 className="size-5" aria-hidden />} title="Callback Insights"
            body="Every application remembers the exact resume version you sent. See which one actually gets replies and interviews.">
            <div className="space-y-3">
              {[["Tailored · v2", 67, 33], ["Master · v1", 17, 0]].map(([label, reply, interview]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-label-md"><span className="font-semibold">{label}</span><span className="tnum font-mono text-on-ink-muted">{reply}% reply</span></div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-on-ink/15">
                    <div className="absolute inset-y-0 left-0 animate-fill rounded-full bg-primary-fixed-dim" style={{ width: `${reply}%` }} />
                    <div className="absolute inset-y-0 left-0 animate-fill rounded-full bg-success" style={{ width: `${interview}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Tile>

          <Tile photo="market" icon={<MapIcon className="size-5" aria-hidden />} title="Market Map"
            body="Skill demand across every job you saved, checked against the evidence in your resume.">
            <ul className="space-y-2">
              {[["Python", 100, "bg-success"], ["Kubernetes", 75, "bg-warning"], ["AWS", 60, "bg-critical"]].map(([s, w, tone]) => (
                <li key={s as string} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-label-md">
                  <span>{s}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-on-ink/15"><span className={cn("block h-full animate-fill rounded-full", tone as string)} style={{ width: `${w}%` }} /></span>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile photo="proofs" icon={<Hammer className="size-5" aria-hidden />} title="Proof Board"
            body="Turn a gap into a small project or certification, and track it until your resume shows it.">
            <div className="flex gap-2 text-label-sm">
              {[["To do", "AWS"], ["Doing", "Terraform"], ["Done", "Kubernetes"]].map(([col, skill], i) => (
                <div key={col} className="flex-1 rounded-control bg-on-ink/10 p-2">
                  <p className="text-on-ink-muted">{col}</p>
                  <p className={cn("mt-1.5 truncate rounded-full px-2 py-0.5 font-mono", i === 2 ? "bg-success text-ink-deep" : "bg-on-ink/15")}>{skill}</p>
                </div>
              ))}
            </div>
          </Tile>

          <div className="relative isolate overflow-hidden rounded-panel bg-[linear-gradient(135deg,var(--color-ink-deep-indigo),var(--color-ink-deep))] p-7 ring-1 ring-on-ink/10 lg:col-span-2">
            <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div>
                <Badge icon={<Timer className="size-5" aria-hidden />} />
                <h3 className="mt-4 font-display text-[26px] font-extrabold leading-tight">Recruiter 6-second scan</h3>
                <p className="mt-2 max-w-md text-body-lg text-on-ink-muted">
                  A heat overlay on your page shows what a first glance lands on, with eight checks to move your best evidence above the line.
                </p>
                <ul className="mt-4 space-y-1.5 text-body-md">
                  {["Latest role's first bullet leads with a result", "4 of 4 bullets contain a number", "Summary is 13 words"].map((t) => (
                    <li key={t} className="flex items-center gap-2"><CircleCheck className="size-4 text-success" aria-hidden />{t}</li>
                  ))}
                </ul>
              </div>
              <div aria-hidden className="relative mx-auto w-44 rotate-2 overflow-hidden rounded-md shadow-level-3 sm:w-full">
                <ResumePaper doc={SAMPLE_RESUME} template="modern" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,94,58,0.45)_0%,rgba(255,170,40,0.25)_24%,transparent_50%)] mix-blend-multiply" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,120,40,0.3)_0%,transparent_32%)] mix-blend-multiply" />
                <div className="absolute inset-x-0 top-[34%] border-t-2 border-dashed border-critical" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Badge({ icon }: { icon: ReactNode }) {
  return <span className="inline-flex size-11 items-center justify-center rounded-control bg-accent text-on-accent">{icon}</span>;
}

function Tile({ photo, icon, title, body, children, className }: { photo: PhotoName; icon: ReactNode; title: string; body: string; children: ReactNode; className?: string }) {
  return (
    <article className={cn("group relative isolate flex min-h-[340px] flex-col justify-end overflow-hidden rounded-panel p-7 ring-1 ring-on-ink/10", className)}>
      <img
        src={PHOTOS[photo]}
        srcSet={photoSrcSet(photo)}
        sizes="(min-width: 1024px) 40vw, 92vw"
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-ink-deep via-ink-deep/85 to-ink-deep/30" />
      <Badge icon={icon} />
      <h3 className="mt-4 font-display text-[26px] font-extrabold leading-tight">{title}</h3>
      <p className="mt-2 max-w-md text-body-lg text-on-ink-muted">{body}</p>
      <div aria-hidden className="mt-5 rounded-card bg-ink-deep/70 p-4 ring-1 ring-on-ink/10 backdrop-blur">{children}</div>
    </article>
  );
}
