import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileCheck2,
  GitCompareArrows,
  LayoutTemplate,
  MessagesSquare,
  PenLine,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { ButtonLink } from "@/components/ui/Button";
import { PRODUCT_NAME } from "@/constants/branding";
import { PHOTOS } from "@/constants/images";
import { TEMPLATE_STYLES } from "@/constants/templates";
import { useSession } from "@/hooks/useSession";
import { SAMPLE_RESUME } from "@/lib/resumeHelpers";

const STEPS = [
  { icon: LayoutTemplate, title: "Pick a template", body: "Six single-column designs that applicant tracking systems can read. Switch any time." },
  { icon: PenLine, title: "Answer short questions", body: "Contact, experience, education, skills. Tips flag weak bullet points as you type." },
  { icon: FileCheck2, title: "Download and check", body: "Get a PDF and see exactly what screening software reads from it." },
];

const FEATURES = [
  { icon: Sparkles, title: "Quick builder", body: "A guided, seven-step builder with a live preview, skill suggestions for your field and a summary drafted from your own entries." },
  { icon: ScanSearch, title: "Job analyzer", body: "Paste a job posting to pull out required and preferred skills, years of experience, education and salary when stated." },
  { icon: GitCompareArrows, title: "Match and skill gaps", body: "A match score with evidence for every requirement, and a clear list of what's missing." },
  { icon: ShieldCheck, title: "Fact-checked tailoring", body: "Reorder and reword for each job. Changes that add numbers, tools or names your resume doesn't contain are flagged." },
  { icon: BriefcaseBusiness, title: "Application tracker", body: "Every application with its status, the resume version you sent and follow-up reminders." },
  { icon: MessagesSquare, title: "Interview prep", body: "Questions built from the job, your experience and your gaps, with a place to practise your answers." },
];

const FAQ = [
  { q: "Will applicant tracking systems read my resume?", a: "Every template is one column of real text with standard headings, and no images, tables or text boxes. After you download, the ATS check reads the PDF back the way screening software does and shows you the result." },
  { q: "Can I start from my existing resume?", a: "Yes. Upload a PDF, DOCX or TXT file. You review everything that was read before anything is saved." },
  { q: "Do I need AI to use it?", a: "No. The builder, job analysis, matching, tailoring and interview questions all work with built-in rules. When AI is switched on for your account, it adds rewrites and extra questions, and those are checked against your resume too." },
  { q: "Who can see my resume?", a: "Only you, when signed in. You can delete your account, and with it every resume and uploaded file, from Settings at any time." },
];

export function LandingPage() {
  const signedIn = Boolean(useSession().data);
  const start = signedIn ? "/resumes/new" : "/register";
  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <a href="#landing-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary">
        Skip to content
      </a>
      <PublicHeader signedIn={signedIn} />

      <main id="landing-main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-linear-to-b from-primary-fixed/60 to-transparent" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
            <div className="animate-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary-fixed-dim bg-surface-container-lowest px-3 py-1 text-label-md text-on-surface-variant">
                <Sparkles className="size-4 text-primary" aria-hidden /> Resume builder · Job matching · Interview prep
              </p>
              <h1 className="mt-5 font-display text-[40px] leading-[1.1] tracking-tight text-on-surface sm:text-[52px]">
                Build a resume that gets read, and back up every line.
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-on-surface-variant">
                Answer a few short questions, watch your resume take shape in a professional template, and download an ATS-friendly PDF.
                Then tailor it to each job without making anything up.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to={start} variant="primary" className="h-12 px-6 text-body-lg">
                  Build my resume <ArrowRight className="size-5" aria-hidden />
                </ButtonLink>
                <a href="#templates" className="inline-flex h-12 items-center rounded-control border border-hairline bg-surface-container-lowest px-6 text-body-lg font-medium text-on-surface hover:border-hairline-strong">
                  See the templates
                </a>
              </div>
              <ul className="mt-8 grid gap-2 text-body-md text-on-surface-variant sm:grid-cols-3">
                {["6 ATS-safe templates", "Live preview as you type", "Nothing invented for you"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-success" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>
            <div className="relative animate-rise [animation-delay:120ms]">
              <div className="relative overflow-hidden rounded-panel shadow-level-3">
                <img src={PHOTOS.register} alt="" className="aspect-[4/3] w-full object-cover" />
                <div aria-hidden className="absolute inset-0 bg-linear-to-tr from-ink-deep/50 to-transparent" />
              </div>
              <div className="absolute -bottom-8 -left-4 w-[46%] rotate-[-3deg] sm:-left-8">
                <ResumePaper doc={SAMPLE_RESUME} template="modern" label="An example resume made with the builder" />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="how-title" className="text-center font-display text-headline-lg">From a blank page to a PDF in three steps</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-card border border-hairline bg-surface-container-lowest p-6 shadow-level-1">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-control bg-primary text-on-primary font-display tnum">{i + 1}</span>
                    <Icon className="size-5 text-primary" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-display text-headline-sm">{title}</h3>
                  <p className="mt-2 text-body-md text-on-surface-variant">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Templates */}
        <section id="templates" aria-labelledby="templates-title" className="scroll-mt-20 bg-surface-container-low py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="templates-title" className="font-display text-headline-lg">Six templates, one click apart</h2>
                <p className="mt-2 max-w-2xl text-body-lg text-on-surface-variant">All single-column with real, selectable text, so screening software reads them top to bottom.</p>
              </div>
              <ButtonLink to={start} variant="primary">Use a template <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            </div>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATE_STYLES.map((t) => (
                <li key={t.id} className="rounded-card border border-hairline bg-surface-container-lowest p-4 shadow-level-1 transition hover:-translate-y-0.5 hover:shadow-level-3">
                  <div className="rounded-control bg-surface-container p-4">
                    <ResumePaper doc={SAMPLE_RESUME} template={t.id} label={`Sample resume in the ${t.name} template`} />
                  </div>
                  <h3 className="mt-4 text-label-md text-on-surface">{t.name}</h3>
                  <p className="text-body-sm text-on-surface-variant">{t.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="features-title" className="text-center font-display text-headline-lg">Everything from first draft to final interview</h2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-card border border-hairline bg-surface-container-lowest p-6 shadow-level-1">
                  <span className="flex size-10 items-center justify-center rounded-control bg-primary-fixed text-on-primary-fixed">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-headline-sm">{title}</h3>
                  <p className="mt-2 text-body-md text-on-surface-variant">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Honest by design */}
        <section aria-labelledby="trust-title" className="py-4">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-panel shadow-level-2">
              <img src={PHOTOS.jobs} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
            </div>
            <div>
              <h2 id="trust-title" className="font-display text-headline-lg">Honest by design</h2>
              <p className="mt-3 text-body-lg text-on-surface-variant">Recruiters check. Your resume should hold up when they do.</p>
              <ul className="mt-6 space-y-5">
                {[
                  { icon: FileCheck2, title: "One master resume", body: "Your verified source of truth. Tailoring and analysis never change it; only your own edits do." },
                  { icon: ShieldCheck, title: "Every change is checked", body: "Tailored wording is compared with your master resume, and anything it can't support is flagged before you accept it." },
                  { icon: Trash2, title: "Your data, your call", body: "Delete your account, resumes and uploaded files from Settings whenever you want." },
                ].map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-success-surface text-success"><Icon className="size-5" aria-hidden /></span>
                    <div>
                      <h3 className="text-body-lg font-semibold">{title}</h3>
                      <p className="text-body-md text-on-surface-variant">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="faq-title" className="text-center font-display text-headline-lg">Questions</h2>
            <div className="mt-8 divide-y divide-hairline rounded-card border border-hairline bg-surface-container-lowest">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-lg font-medium">
                    {q}
                    <ArrowRight className="size-4 shrink-0 text-on-surface-variant transition group-open:rotate-90" aria-hidden />
                  </summary>
                  <p className="mt-3 text-body-md text-on-surface-variant">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section aria-labelledby="cta-title" className="px-4 pb-16 sm:px-6">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-panel bg-ink-deep px-6 py-14 text-center sm:px-12">
            <img src={PHOTOS.applications} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-ink-deep/85" />
            <h2 id="cta-title" className="font-display text-headline-lg text-on-ink">Your next resume is a few minutes away</h2>
            <p className="mx-auto mt-3 max-w-xl text-body-lg text-on-ink-muted">Start with a template, or upload the resume you already have.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to={start} variant="primary" className="h-12 px-6 text-body-lg">Build my resume <ArrowRight className="size-5" aria-hidden /></ButtonLink>
              <ButtonLink to="/pricing" className="h-12 px-6 text-body-lg">See pricing</ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-body-sm text-on-surface-variant sm:px-6">
          <p>© {new Date().getFullYear()} {PRODUCT_NAME}</p>
          <p>
            Photos from <a href="https://unsplash.com" className="underline hover:text-primary" rel="noreferrer noopener" target="_blank">Unsplash</a>
            {" · "}
            <Link to="/pricing" className="underline hover:text-primary">Pricing</Link>
            {" · "}
            <Link to="/login" className="underline hover:text-primary">Sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
