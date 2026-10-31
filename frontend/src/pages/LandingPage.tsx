import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileCheck2,
  MessagesSquare,
  Plus,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { ButtonLink } from "@/components/ui/Button";
import { PRODUCT_NAME } from "@/constants/branding";
import { OnlyHereSection } from "@/pages/landing/OnlyHereSection";
import { TEMPLATE_STYLES } from "@/constants/templates";
import { motionAllowed } from "@/hooks/useCountUp";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/cn";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

const FIELDS = ["Software engineering", "Data & analytics", "Product design", "Marketing", "Sales", "Finance", "Operations", "Healthcare", "Education", "Customer support"];

/** "What the ATS read": a two-column resume flattened left to right, so the columns interleave. */
function ScrambledScene() {
  return (
    <div className="grid grid-cols-2 gap-2.5 text-[9px] leading-snug">
      <div className="rounded-[6px] border border-hairline bg-surface-container-low p-2">
        <p className="text-[10px] font-bold text-on-surface">Priya Raman</p>
        <p className="text-on-surface-variant">Backend Engineer</p>
        <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 border-t border-hairline pt-1.5 text-on-surface-variant">
          <p className="font-bold text-on-surface">Skills</p>
          <p className="font-bold text-on-surface">Experience</p>
          <p>Python</p>
          <p>Acme Corp</p>
          <p>SQL</p>
          <p>2021–now</p>
          <p>Docker</p>
          <p>Cut latency 40%</p>
        </div>
      </div>
      <div className="rounded-[6px] bg-surface-container-highest p-2 font-mono text-on-surface">
        <p className="mb-1 text-[8px] uppercase tracking-wider text-on-surface-variant">What the ATS read</p>
        <p>Skills Experience</p>
        <p>Python Acme Corp</p>
        <p><span className="bg-critical-border/50">SQL 2021–now</span></p>
        <p>Docker Cut latency</p>
        <p className="mt-1 text-on-surface-variant">Job title: <span className="text-critical-ink">none</span></p>
      </div>
    </div>
  );
}

/** A real-looking posting checked against a resume: two required skills aren't there. */
function MismatchScene() {
  const reqs: [string, boolean, boolean][] = [["Python", true, true], ["PostgreSQL", true, true], ["Kubernetes", false, true], ["AWS", false, true], ["GraphQL", true, false]];
  return (
    <div className="text-[10px] leading-snug">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-on-surface">Senior Backend Engineer</p>
        <p className="shrink-0 font-mono text-warning-ink">Match 54%</p>
      </div>
      <p className="text-on-surface-variant">Northwind Retail · Bengaluru · Hybrid</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full w-[54%] bg-warning" /></div>
      <ul className="mt-2 flex flex-wrap gap-1">
        {reqs.map(([name, has, required]) => (
          <li key={name} className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5", has ? "border-hairline text-on-surface-variant" : "border-warning-border bg-warning-border/40 font-semibold text-warning-ink")}>
            {has ? <Check className="size-2.5 text-success" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
            {name}
            {required ? <span>· req</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An inflated bullet next to the line it was "improved" from. */
function ClaimScene() {
  const hot = "rounded-[3px] bg-info-border/60 px-0.5 font-semibold text-info-ink";
  return (
    <div className="space-y-2 text-[10px] leading-snug">
      <div className="rounded-[6px] border border-hairline bg-surface-container-low p-2">
        <p className="text-[8px] uppercase tracking-wider text-on-surface-variant">Rewritten bullet</p>
        <p className="mt-0.5 text-on-surface">
          <span className={hot}>Spearheaded</span> a <span className={hot}>company-wide</span> AI platform, growing revenue <span className={hot}>3x</span>.
        </p>
      </div>
      <div className="rounded-[6px] border border-dashed border-hairline-strong p-2">
        <p className="text-[8px] uppercase tracking-wider text-on-surface-variant">Your master resume says</p>
        <p className="mt-0.5 text-on-surface-variant">Built an internal Slack bot that answers HR questions for 120 staff.</p>
      </div>
    </div>
  );
}

const PROBLEMS = [
  { title: "Screening software can't read it", body: "Columns, tables and text boxes scramble the order, so key details never reach a recruiter.", fix: "Every template is real text in reading order.", tone: "ring-critical-surface", tag: "Text out of order", tagTone: "bg-critical-border/60 text-critical-ink", scene: <ScrambledScene /> },
  { title: "It doesn't match the job", body: "The same resume for every posting misses the skills each one asks for.", fix: "See evidence and gaps for every requirement.", tone: "ring-warning-surface", tag: "Required skills missing", tagTone: "bg-warning-border/70 text-warning-ink", scene: <MismatchScene /> },
  { title: "Claims you can't back up", body: "Inflated wording falls apart in the interview, when it matters most.", fix: "Changes your resume can't support are flagged.", tone: "ring-info-surface", tag: "Unsupported claim", tagTone: "bg-info-border/70 text-info-ink", scene: <ClaimScene /> },
];

const STEPS = [
  { title: "Pick a template", body: `${TEMPLATE_STYLES.length} designs that applicant tracking systems can read, from one-column classics to sidebars. Switch any time.` },
  { title: "Answer short questions", body: "Contact, experience, education, skills. Tips flag weak bullet points as you type." },
  { title: "Download and check", body: "Get a PDF and see exactly what screening software reads from it." },
];

const MORE = [
  { icon: ScanSearch, title: "Job analyzer", body: "Paste a job posting to pull out required and preferred skills, years of experience, education and salary when stated." },
  { icon: BriefcaseBusiness, title: "Application tracker", body: "Every application with its status, the resume version you sent and follow-up reminders." },
  { icon: MessagesSquare, title: "Interview prep", body: "Questions built from the job, your experience and your gaps, with a place to practise your answers." },
];

const WITH_US = [
  "Ready in minutes with a guided, seven-step builder",
  "Templates screening software reads top to bottom",
  "Tips on every bullet point as you type",
  "A match score with evidence for each requirement",
  "Every tailored change checked against your own resume",
];
const ALONE = [
  "Hours spent on formatting and wording",
  "Layouts that can scramble in screening software",
  "No idea which bullet points are weak",
  "Guessing how well you fit a job",
  "Easy to overstate and get caught out",
];

const FAQ = [
  { q: "Will applicant tracking systems read my resume?", a: "Every template is real, selectable text with standard headings in a fixed reading order. One-column designs are the safest; sidebar and timeline designs are labelled ATS-friendly. After you download, the ATS check reads the PDF back the way screening software does and shows you the result." },
  { q: "Can I start from my existing resume?", a: "Yes. Upload a PDF, DOCX or TXT file. You review everything that was read before anything is saved." },
  { q: "Do I need AI to use it?", a: "No. The builder, job analysis, matching, tailoring and interview questions all work with built-in rules. When AI is switched on for your account, it adds rewrites and extra questions, and those are checked against your resume too." },
  { q: "Who can see my resume?", a: "Only you, when signed in. You can delete your account, and with it every resume and uploaded file, from Settings at any time." },
  { q: "Is it free?", a: "Yes. The free plan includes the builder, every template, the ATS check, matching and tailoring. Pro adds AI help and is on a waitlist for now." },
];

const DEMO_BULLET = "Built a payments API in Python and PostgreSQL serving 3 regional banks.";

/** Types the demo bullet point on a loop. Shows it whole when motion is reduced. */
function useTypedDemo(text: string): string {
  const [n, setN] = useState(() => (motionAllowed() ? 0 : text.length));
  useEffect(() => {
    if (!motionAllowed()) return;
    const id = window.setInterval(() => setN((i) => (i >= text.length + 40 ? 0 : i + 1)), 60);
    return () => window.clearInterval(id);
  }, [text]);
  return text.slice(0, Math.min(n, text.length));
}

function demoTip(typed: string, full: string): { text: string; tone: string } {
  if (typed.length === full.length) return { text: "Strong bullet: action verb, a real result, short.", tone: "bg-success-surface text-success-ink" };
  if (/\d/.test(typed)) return { text: "A concrete number. Keep it to one or two lines.", tone: "bg-warning-surface text-warning-ink" };
  if (typed.length >= 5) return { text: "Good opener. Add a real result if you have one.", tone: "bg-info-surface text-info-ink" };
  return { text: "Start with an action verb: Built, Led, Designed…", tone: "bg-info-surface text-info-ink" };
}

const eyebrow = "inline-flex items-center gap-2 font-mono text-label-sm font-medium uppercase tracking-[0.16em] text-primary before:size-1.5 before:rounded-full before:bg-current before:content-['']";
/** The same eyebrow on the dark ink panels (cn doesn't merge classes, so the colour is swapped here). */
const eyebrowOnInk = eyebrow.replace("text-primary", "text-on-ink-success");
const h2 = "font-display text-[32px] font-bold leading-[1.08] tracking-[-0.035em] text-balance sm:text-[44px]";
const stepPill = "font-mono text-label-sm font-medium uppercase tracking-[0.16em] text-primary";
const h3 = "mt-3 font-display text-[28px] font-bold leading-tight tracking-[-0.025em]";
/** Neutral stage behind a feature illustration. */
const stage = "relative overflow-hidden rounded-panel border border-hairline bg-surface-container-low p-6 sm:p-8";

/** The hero's product shot, built from the real preview component rather than a screenshot. */
function HeroProduct() {
  const reqs: [string, string, string][] = [
    ["Python, PostgreSQL", "Shown in a role", "bg-success"],
    ["REST API design", "Shown in a role", "bg-success"],
    ["Redis", "Only listed", "bg-warning"],
    ["Kubernetes", "Missing", "bg-critical"],
  ];
  return (
    <div aria-hidden className="card overflow-hidden shadow-level-3">
      <div className="flex items-center gap-1.5 border-b border-hairline bg-surface-container-low px-4 py-2.5">
        {[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-hairline-strong" />)}
        <p className="ml-3 truncate font-mono text-label-sm text-on-surface-variant">tailor / senior-backend-engineer · northwind</p>
      </div>
      <div className="grid sm:grid-cols-[1.1fr_1fr]">
        <div className="bg-surface-container p-4 sm:p-5">
          <ResumePaper doc={SAMPLE_RESUME} template="classic" />
        </div>
        <div className="space-y-4 border-t border-hairline p-4 sm:border-l sm:border-t-0 sm:p-5">
          <div>
            <p className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-variant">Match score</p>
            <p className="mt-1 font-display text-[34px] font-bold leading-none tracking-tight tnum">84<span className="text-body-md font-medium text-on-surface-variant">/100</span></p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full w-[84%] animate-fill rounded-full bg-primary" /></div>
          </div>
          <ul className="space-y-2 text-body-sm">
            {reqs.map(([name, status, dot]) => (
              <li key={name} className="flex items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <span className="shrink-0 text-on-surface-variant">{status}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-control border border-critical-border bg-critical-surface px-3 py-2 text-body-sm text-critical-ink">
            <span className="font-semibold">Flagged:</span> "40%" isn't in your master resume
          </div>
          <p className="flex items-center gap-1.5 border-t border-hairline pt-3 text-body-sm text-on-surface-variant">
            <FileCheck2 className="size-4 text-success" /> ATS read-back passed · 1 page
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const signedIn = Boolean(useSession().data);
  const start = signedIn ? "/resumes/new" : "/register";
  const typed = useTypedDemo(DEMO_BULLET);
  const tip = demoTip(typed, DEMO_BULLET);
  const [tailored, setTailored] = useState(true);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-surface-container-lowest text-on-surface">
      <a href="#landing-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary">
        Skip to content
      </a>
      <p className="border-b border-hairline bg-surface px-4 py-2 text-center text-body-sm text-on-surface-variant">
        <span className="mr-2 rounded-full border border-primary-fixed-dim bg-primary-fixed px-2 py-0.5 font-mono text-label-sm font-medium uppercase tracking-wider text-on-primary-fixed">New</span>
        Callback Insights, Market Map, Proof Board and the Recruiter 6-second scan.{" "}
        <a href="#only-here" className="font-medium text-on-surface underline-offset-4 hover:underline">See what's new</a>
      </p>
      <PublicHeader signedIn={signedIn} />

      <main id="landing-main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden bg-surface">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-grid text-on-surface [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
          <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 grid-cols-[minmax(0,1fr)] sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-20">
            <div className="animate-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-container-lowest py-1 pl-1 pr-3 text-body-sm font-medium text-on-surface-variant shadow-level-1">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-on-primary"><Check className="size-3" strokeWidth={3} aria-hidden /></span>
                Every line checked against your own resume
              </p>
              <h1 className="mt-6 font-display text-[42px] font-bold leading-[1.02] tracking-[-0.045em] text-balance sm:text-[58px] lg:text-[64px]">
                Build a resume that gets <span className="text-primary">read</span>, and back up every line.
              </h1>
              <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                Answer a few short questions, watch your resume take shape in a professional template, and download an ATS-friendly PDF.
                Then tailor it to each job without making anything up.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to={start} variant="primary" className="h-12 px-6 text-body-lg shadow-brand">
                  Build my resume <ArrowRight className="size-5" aria-hidden />
                </ButtonLink>
                <Link to="/templates" className="inline-flex h-12 items-center gap-2 rounded-control border border-hairline-strong bg-surface-container-lowest px-5 text-body-lg font-semibold text-on-surface shadow-level-1 hover:bg-surface-container-low">
                  See the templates
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-body-md text-on-surface-variant">
                {[`${TEMPLATE_STYLES.length} ATS-safe templates`, "Live preview as you type", "Nothing invented for you"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-success" strokeWidth={3} aria-hidden />{t}</li>
                ))}
              </ul>
            </div>

            <div className="animate-rise [animation-delay:120ms]">
              <HeroProduct />
            </div>
          </div>
        </section>

        {/* Fields strip: decorative, so the duplicate copy for the loop is hidden from assistive tech */}
        <section aria-label="Skill suggestions for your field" className="overflow-hidden border-y border-hairline bg-surface-container-lowest py-4 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-12 whitespace-nowrap text-body-lg font-medium text-on-surface-variant hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 || undefined} className="flex gap-12">
                {FIELDS.map((f) => (
                  <li key={f} className="flex items-center gap-12">{f}<span aria-hidden className="size-1 rounded-full bg-outline" /></li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* Problems */}
        <section aria-labelledby="problem-title" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className={eyebrow}>Why resumes get skipped</p>
            <h2 id="problem-title" className={cn(h2, "mt-3")}>Your resume might be the problem. <span className="text-primary">Here's how we fix it.</span></h2>
          </div>
          <ul className="mt-14 grid gap-6 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <li key={p.title} className="card lift flex flex-col gap-3 p-5 sm:p-6">
                <div aria-hidden className={cn("relative min-h-44 rounded-control border border-hairline bg-surface-container-lowest p-3.5 pb-10 ring-4", p.tone)}>
                  {p.scene}
                  <span className={cn("absolute bottom-2.5 right-3 rounded-full px-2.5 py-1 text-label-sm font-bold", p.tagTone)}>{p.tag}</span>
                </div>
                <h3 className="mt-2 font-display text-headline-sm font-semibold">{p.title}</h3>
                <p className="text-body-md text-on-surface-variant">{p.body}</p>
                <p className="mt-auto flex items-start gap-2 border-t border-hairline pt-4 font-medium"><Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} aria-hidden />{p.fix}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Guided builder band */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 px-4 sm:px-6">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-panel bg-ink-deep px-6 py-14 text-on-ink ring-1 ring-on-ink/10 sm:px-12 lg:py-18">
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid text-on-ink [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div aria-hidden className="absolute -top-32 left-1/2 -z-10 h-72 w-[640px] -translate-x-1/2 rounded-full bg-[#10b981]/20 blur-3xl" />
            <div className="relative mx-auto max-w-3xl text-center">
              <p className={eyebrowOnInk}>How it works</p>
              <h2 id="how-title" className={cn(h2, "mt-3")}>From a blank page to a PDF in three steps</h2>
              <p className="mt-4 text-body-lg text-on-ink-muted">Eight short steps and a live preview. Tips appear as you type, and the summary is drafted only from what you entered.</p>
            </div>
            <ol className="relative mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
              {STEPS.map(({ title, body }, i) => (
                <li key={title} className="rounded-card bg-on-ink/[0.04] p-5 ring-1 ring-on-ink/10">
                  <span className="font-mono text-label-md text-on-ink-success tnum">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-headline-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-body-md text-on-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
            <figure className="card relative mx-auto mt-8 max-w-4xl p-5 text-on-surface shadow-level-3 sm:p-6">
              <figcaption className="sr-only">An example of the builder's tips on a bullet point.</figcaption>
              <div aria-hidden>
                <p className="text-body-md font-semibold">Bullet point · Backend Engineer, Fintrail</p>
                <div className="mt-2 min-h-16 rounded-control border border-primary px-4 py-3 text-body-lg shadow-focus">
                  {typed}
                  <span className="ml-px inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-primary" />
                </div>
                <p className={cn("mt-3 rounded-control px-3 py-2.5 text-body-md font-medium", tip.tone)}>{tip.text}</p>
              </div>
            </figure>
            <div className="relative mt-10 text-center">
              <ButtonLink to={start} variant="primary" className="h-12 px-6 text-body-lg">Build my resume <ArrowRight className="size-5" aria-hidden /></ButtonLink>
            </div>
          </div>
        </section>

        {/* Feature rows */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-10 pt-28 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className={eyebrow}>From draft to interview</p>
            <h2 id="features-title" className={cn(h2, "mt-3")}>Everything from first draft to final interview</h2>
          </div>

          <div className="mt-20 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className={stepPill}>Import</p>
              <h3 className={h3}>Start from the resume you have</h3>
              <p className="mt-3 text-body-lg text-on-surface-variant">Upload a PDF, DOCX or TXT. Every section is read into an editable form with a confidence level, and nothing is saved until you've reviewed it.</p>
            </div>
            <div aria-hidden className={stage}>
              <div className="card p-5 shadow-level-2">
                <div className="flex items-center gap-3 rounded-control border-2 border-dashed border-primary-fixed-dim p-3">
                  <span className="flex h-12 w-10 items-center justify-center rounded-md bg-critical text-label-sm font-bold text-on-primary">PDF</span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">my-resume.pdf</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full w-full animate-fill rounded-full bg-primary" /></div></div>
                  <Upload className="size-5 text-primary" />
                </div>
                <ul className="mt-4 space-y-2 text-body-md">
                  {[["Contact", "High", "bg-success-surface text-success-ink"], ["Experience · 3 roles", "High", "bg-success-surface text-success-ink"], ["Skills · 14", "Medium", "bg-warning-surface text-warning-ink"], ["Projects", "Review", "bg-critical-surface text-critical-ink"]].map(([n, c, tone]) => (
                    <li key={n} className="flex items-center justify-between rounded-control bg-surface-container-low px-3 py-2.5"><span className="font-medium">{n}</span><span className={cn("rounded-full px-2.5 py-0.5 text-label-sm font-bold", tone)}>{c}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-24 grid items-center gap-12 lg:grid-cols-2">
            <div aria-hidden className={cn(stage, "order-last lg:order-first")}>
              <div className="card p-5 shadow-level-2">
                <div className="flex items-center justify-between"><p className="font-semibold">Required · 4 of 5 met</p><span className="font-display font-bold text-primary tnum">84/100</span></div>
                <ul className="mt-3 space-y-2.5 text-body-md">
                  {[["Python and PostgreSQL", "Strong", "Shown in a role", "bg-info-surface text-info-ink"], ["Redis or Memcached", "Only listed", "In Skills, but no role shows it", "bg-warning-surface text-warning-ink"], ["Kubernetes in production", "Missing", "Not found in your resume", "bg-critical-surface text-critical-ink"]].map(([t, s, e, tone]) => (
                    <li key={t} className="rounded-control border border-hairline p-3"><div className="flex justify-between gap-3"><span className="font-medium">{t}</span><span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-label-sm font-bold", tone)}>{s}</span></div><p className="mt-1 text-body-sm text-on-surface-variant">{e}</p></li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <p className={stepPill}>Match</p>
              <h3 className={h3}>See exactly where you stand for a job</h3>
              <p className="mt-3 text-body-lg text-on-surface-variant">A match score with evidence for every requirement: shown in a role, only listed, or missing. Gaps are ranked so you know what to fix first.</p>
            </div>
          </div>

          <div className="mt-24 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className={stepPill}>Tailor</p>
              <h3 className={h3}>Tailor for each job, without making things up</h3>
              <p className="mt-3 text-body-lg text-on-surface-variant">Reorder and reword for each job. Changes that add numbers, tools or names your resume doesn't contain are flagged before you can accept them.</p>
              <div role="group" aria-label="Compare versions" className="mt-6 inline-flex gap-1 rounded-full border border-hairline bg-surface-container-low p-1">
                {[["Original", false], ["Tailored", true]].map(([label, value]) => (
                  <button key={String(label)} type="button" aria-pressed={tailored === value} onClick={() => setTailored(Boolean(value))} className={cn("h-10 rounded-full px-5 font-semibold transition-colors", tailored === value ? "bg-surface-container-lowest text-on-surface shadow-level-2" : "text-on-surface-variant")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className={stage}>
              <div key={String(tailored)} className="card animate-pop space-y-2.5 p-5 text-body-md shadow-level-2">
                <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{tailored ? "Tailored for Senior Backend Engineer" : "Master resume (never changed)"}</p>
                {tailored ? (
                  <>
                    <p className="rounded-control border border-success-border bg-success-surface p-3">Built a payments API in Python and PostgreSQL serving 3 regional banks.<span className="mt-1 block text-body-sm font-semibold text-success-ink">Moved to the top: matches 2 required skills</span></p>
                    <p className="rounded-control border border-hairline p-3">Designed versioned REST APIs consumed by web and mobile clients.</p>
                    <p className="rounded-control border border-critical-border bg-critical-surface p-3">Cut API latency by 40% with Redis caching.<span className="mt-1 block text-body-sm font-semibold text-critical-ink">Flagged: "40%" isn't in your master resume</span></p>
                  </>
                ) : (
                  <>
                    <p className="rounded-control border border-hairline p-3">Designed versioned REST APIs consumed by web and mobile clients.</p>
                    <p className="rounded-control border border-hairline p-3">Built a payments API in Python and PostgreSQL serving 3 regional banks.</p>
                    <p className="rounded-control border border-hairline p-3">Added Redis caching to the payments API.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-24 grid items-center gap-12 lg:grid-cols-2">
            <div aria-hidden className={cn(stage, "order-last flex items-center justify-center gap-5 lg:order-first")}>
              <div className="w-[46%]"><ResumePaper doc={SAMPLE_RESUME} template="classic" label="An example resume made with the builder" /></div>
              <div className="min-w-0 flex-1 rounded-card bg-ink-deep p-4 font-mono text-code-sm leading-6 text-on-ink ring-1 ring-on-ink/10">
                <p className="mb-1 text-on-ink-success">$ ats read resume.pdf</p>
                <p>1 Name and contact</p><p>2 Summary</p><p>3 Experience</p><p>4 Education</p><p>5 Skills</p>
                <p className="mt-2 text-on-ink-success">✓ Headings in order</p>
              </div>
            </div>
            <div>
              <p className={stepPill}>Download</p>
              <h3 className={h3}>Download a PDF, then see what an ATS sees</h3>
              <p className="mt-3 text-body-lg text-on-surface-variant">The ATS check reads your PDF back the way screening software does, in order, so you know the text, headings and contact details all come through.</p>
            </div>
          </div>

          <ul className="mt-24 grid gap-5 md:grid-cols-3">
            {MORE.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card lift p-6">
                <span className="flex size-10 items-center justify-center rounded-control border border-hairline bg-surface-container-low text-primary"><Icon className="size-5" aria-hidden /></span>
                <h3 className="mt-4 font-display text-headline-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-body-md text-on-surface-variant">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Templates */}
        <OnlyHereSection eyebrow={eyebrowOnInk} h2={h2} />

        <section id="templates" aria-labelledby="templates-title" className="scroll-mt-20 border-y border-hairline bg-surface-container-low py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={eyebrow}>Templates</p>
                <h2 id="templates-title" className={cn(h2, "mt-3")}>{TEMPLATE_STYLES.length} templates, one click apart</h2>
                <p className="mt-3 max-w-2xl text-body-lg text-on-surface-variant">One-column classics, sidebars, timelines and photo layouts. All real, selectable text in a fixed reading order, so screening software reads them top to bottom.</p>
              </div>
              <ButtonLink to="/templates" variant="primary">Browse all templates <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            </div>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {["classic", "banner-forest", "executive", "stripe-charcoal", "elegant-teal", "statement-navy"].map((id) => TEMPLATE_STYLES.find((t) => t.id === id)!).map((t) => (
                <li key={t.id} className="card lift p-3">
                  <div className="rounded-control bg-surface-container p-4">
                    <ResumePaper doc={SAMPLE_RESUME} template={t.id} label={`Sample resume in the ${t.name} template`} />
                  </div>
                  <h3 className="mt-3 px-1 font-semibold text-on-surface">{t.name}</h3>
                  <p className="px-1 pb-1 text-body-sm text-on-surface-variant">{t.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Comparison */}
        <section aria-labelledby="compare-title" className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
          <h2 id="compare-title" className={cn(h2, "text-center")}>The builder vs writing it alone</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="card relative overflow-hidden p-8 ring-1 ring-primary/30">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
              <p className="font-display text-headline-md font-semibold">With {PRODUCT_NAME}</p>
              <ul className="mt-5 space-y-3.5">
                {WITH_US.map((w) => (
                  <li key={w} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>{w}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-dashed border-hairline-strong p-8">
              <p className="font-display text-headline-md font-semibold">Writing it alone</p>
              <ul className="mt-5 space-y-3.5 text-on-surface-variant">
                {ALONE.map((a) => (
                  <li key={a} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"><X className="size-3.5" strokeWidth={3} aria-hidden /></span>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Honest by design */}
        <section aria-labelledby="trust-title" className="px-4 sm:px-6">
          <div className="relative isolate mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-panel bg-ink-deep p-8 text-on-ink ring-1 ring-on-ink/10 sm:p-12 lg:grid-cols-[1fr_1.4fr]">
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid text-on-ink [mask-image:linear-gradient(to_right,black,transparent_60%)]" />
            <div>
              <h2 id="trust-title" className={h2}>Honest by design</h2>
              <p className="mt-3 text-body-lg text-on-ink-muted">Recruiters check. Your resume should hold up when they do.</p>
            </div>
            <ul className="space-y-5">
              {[
                { icon: FileCheck2, title: "One master resume", body: "Your verified source of truth. Tailoring and analysis never change it; only your own edits do." },
                { icon: ShieldCheck, title: "Every change is checked", body: "Tailored wording is compared with your master resume, and anything it can't support is flagged before you accept it." },
                { icon: Trash2, title: "Your data, your call", body: "Delete your account, resumes and uploaded files from Settings whenever you want." },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-on-ink/[0.06] text-on-ink-success ring-1 ring-on-ink/10"><Icon className="size-5" aria-hidden /></span>
                  <div>
                    <h3 className="text-body-lg font-semibold">{title}</h3>
                    <p className="text-body-md text-on-ink-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="faq-title" className={h2}>Questions</h2>
              <p className="mt-3 text-body-lg text-on-surface-variant">The short answers. Your data stays yours, and nothing is invented on your behalf.</p>
            </div>
            <div className="space-y-3">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="card group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-lg font-semibold">
                    {q}
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline text-on-surface-variant transition-transform group-open:rotate-45"><Plus className="size-4" aria-hidden /></span>
                  </summary>
                  <p className="mt-3 text-body-md text-on-surface-variant">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section aria-labelledby="cta-title" className="px-4 pb-20 sm:px-6">
          <div className="relative isolate mx-auto flex max-w-6xl flex-wrap items-center gap-8 overflow-hidden rounded-panel bg-ink-deep px-8 py-14 ring-1 ring-on-ink/10 sm:px-14">
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid text-on-ink [mask-image:radial-gradient(ellipse_at_right,black,transparent_70%)]" />
            <div aria-hidden className="absolute -right-24 top-1/2 -z-10 h-72 w-96 -translate-y-1/2 rounded-full bg-[#10b981]/25 blur-3xl" />
            <div className="min-w-0 flex-[2_1_420px]">
              <h2 id="cta-title" className={cn(h2, "text-on-ink")}>Your next resume is a few minutes away</h2>
              <p className="mt-3 text-body-lg text-on-ink-muted">Start with a template, or upload the resume you already have.</p>
            </div>
            <div className="flex flex-[1_1_260px] flex-wrap gap-3">
              <ButtonLink to={start} className="h-12 border-transparent bg-[#ffffff] px-6 text-body-lg text-[#0c0f0e] hover:bg-[#f5f5f4]">Build my resume <ArrowRight className="size-5" aria-hidden /></ButtonLink>
              <Link to="/pricing" className="inline-flex h-12 items-center rounded-control border border-on-ink/25 px-5 text-body-lg font-semibold text-on-ink hover:bg-on-ink/[0.06]">See pricing</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline py-8 text-on-surface-variant">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-body-sm sm:px-6">
          <p>© {new Date().getFullYear()} {PRODUCT_NAME}</p>
          <p>
            Photos from <a href="https://unsplash.com" className="underline hover:text-on-surface" rel="noreferrer noopener" target="_blank">Unsplash</a>
            {" · "}
            <Link to="/pricing" className="underline hover:text-on-surface">Pricing</Link>
            {" · "}
            <Link to="/login" className="underline hover:text-on-surface">Sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
