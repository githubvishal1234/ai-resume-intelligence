import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Search, SearchX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading, Skeleton } from "@/components/ui/States";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useResumeList } from "@/hooks/useResumes";
import { formatDate, PageHeader } from "@/pages/resumes/common";
import { jobSearchService, type JobListing, type JobSearch } from "@/services/jobSearchService";

const PER_PAGE = 20;
const MAX_PAGE = 10;
const CURRENCY: Record<string, string> = { in: "INR", gb: "GBP", us: "USD" };

function salary(item: JobListing, country: string): string | null {
  const currency = CURRENCY[country];
  if (!currency || (item.salary_min == null && item.salary_max == null)) return null;
  const fmt = new Intl.NumberFormat(country === "in" ? "en-IN" : "en", { style: "currency", currency, maximumFractionDigits: 0 });
  const lo = item.salary_min ?? item.salary_max!;
  const hi = item.salary_max ?? lo;
  return lo === hi ? fmt.format(lo) : `${fmt.format(lo)}–${fmt.format(hi)}`;
}

/**
 * Live openings for one of the user's resumes, from Adzuna, ranked by how many of the skills
 * each listing mentions the resume backs up. The search words start from the resume and stay
 * in the address bar, so a search can be shared and survives a reload.
 */
export function FindJobsPage() {
  const caps = useCapabilities();
  const resumes = useResumeList();
  const [params, setParams] = useSearchParams();

  if (caps.isPending || resumes.isPending) return <PageLoading label="Loading" />;
  if (resumes.isError) return <ErrorState error={resumes.error} onRetry={() => void resumes.refetch()} />;

  const usable = resumes.data.filter((r) => r.status === "active");
  const header = (
    <PageHeader
      title="Find Jobs"
      description="Live openings for one of your resumes, ranked by the skills your resume already backs up."
    />
  );
  if (!caps.data?.job_search.configured) {
    return (
      <div>
        {header}
        <Notice tone="info" title="Live job search isn't set up yet">
          This deployment has no job-search key. An administrator adds an Adzuna app id and key (ADZUNA_APP_ID and ADZUNA_APP_KEY), then
          this page lists openings for your resume. Meanwhile, paste a posting into the{" "}
          <Link to="/jobs/new" className="font-semibold underline">Job Analyzer</Link> to match it.
        </Notice>
      </div>
    );
  }
  if (usable.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          title="Add a resume first"
          description="Openings are searched from your resume's latest job title and skills."
          action={<ButtonLink to="/resumes/new" variant="primary">Build my resume</ButtonLink>}
        />
      </div>
    );
  }

  const chosen = usable.find((r) => r.id === params.get("resume")) ?? usable.find((r) => r.kind === "master") ?? usable[0]!;
  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k);
      else merged.set(k, v);
    }
    setParams(merged, { replace: false });
  };

  return (
    <div>
      {header}
      <Results
        key={chosen.id}
        resumes={usable.map((r) => ({ id: r.id, label: `${r.kind === "master" ? "Master" : "Tailored"}: ${r.title}` }))}
        resumeId={chosen.id}
        what={params.get("what") ?? undefined}
        where={params.get("where") ?? undefined}
        page={Math.min(MAX_PAGE, Math.max(1, Number(params.get("page")) || 1))}
        onChange={update}
      />
    </div>
  );
}

function Results({
  resumes,
  resumeId,
  what,
  where,
  page,
  onChange,
}: {
  resumes: { id: string; label: string }[];
  resumeId: string;
  what: string | undefined;
  where: string | undefined;
  page: number;
  onChange: (next: Record<string, string | null>) => void;
}) {
  const search = useQuery({
    queryKey: ["job-search", resumeId, what ?? null, where ?? null, page],
    queryFn: () => jobSearchService.search({ resumeId, what, where, page }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  // The boxes start from the resume's own words, once the first answer says what they were.
  const [draft, setDraft] = useState<{ what: string; where: string } | null>(null);
  const shown = draft ?? (search.data ? search.data.query : { what: what ?? "", where: where ?? "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onChange({ what: shown.what.trim(), where: shown.where.trim(), page: null });
    setDraft(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-end">
          <Field label="Resume">
            {({ id }) => (
              <Select id={id} value={resumeId} onChange={(e) => onChange({ resume: e.target.value, what: null, where: null, page: null })}>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Job title or keywords">
            {({ id }) => <Input id={id} value={shown.what} maxLength={100} onChange={(e) => setDraft({ ...shown, what: e.target.value })} />}
          </Field>
          <Field label="Location">
            {({ id }) => <Input id={id} value={shown.where} maxLength={100} placeholder="Anywhere" onChange={(e) => setDraft({ ...shown, where: e.target.value })} />}
          </Field>
          <Button type="submit" icon={<Search className="size-4" aria-hidden />} disabledReason={shown.what.trim() ? undefined : "Add a job title or keywords."}>
            Search
          </Button>
        </form>
      </Card>

      {search.isPending ? (
        <div role="status" aria-live="polite" className="space-y-3">
          <span className="sr-only">Searching openings…</span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} title="Couldn't search openings" />
      ) : (
        <Listings data={search.data} fetching={search.isFetching} onPage={(p) => onChange({ page: String(p) })} />
      )}
    </div>
  );
}

function Listings({ data, fetching, onPage }: { data: JobSearch; fetching: boolean; onPage: (page: number) => void }) {
  const lastPage = Math.min(MAX_PAGE, Math.max(1, Math.ceil(data.total / PER_PAGE)));
  if (data.results.length === 0) {
    return (
      <EmptyState
        icon={<SearchX aria-hidden />}
        title="No openings found"
        description={`Nothing matched "${data.query.what}"${data.query.where ? ` in ${data.query.where}` : ""}. Try a broader title, or clear the location.`}
      />
    );
  }
  return (
    <section aria-labelledby="results-title" aria-busy={fetching || undefined} className={fetching ? "opacity-60 transition-opacity" : undefined}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-title" className="font-display text-headline-sm text-on-surface">
          <span className="tnum">{data.total.toLocaleString()}</span> openings for “{data.query.what}”{data.query.where ? ` in ${data.query.where}` : ""}
        </h2>
        <p className="text-body-sm text-on-surface-variant">Page {data.page} of {lastPage} · best evidence first</p>
      </div>
      <ul className="space-y-3">
        {data.results.map((item) => (
          <li key={item.id}>
            <Listing item={item} country={data.country} attribution={data.attribution_url} />
          </li>
        ))}
      </ul>
      <nav aria-label="Result pages" className="mt-4 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" icon={<ChevronLeft className="size-4" aria-hidden />} disabledReason={data.page <= 1 ? "This is the first page." : undefined} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabledReason={data.page >= lastPage ? "No more pages." : undefined} onClick={() => onPage(data.page + 1)}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </nav>
      <p className="mt-4 text-body-sm text-on-surface-variant">
        Skills are read from each listing's title and summary only ({data.method_version}); open the posting for its full requirements. To match one in full, paste it into the{" "}
        <Link to="/jobs/new" className="font-semibold text-primary hover:underline">Job Analyzer</Link>.
      </p>
    </section>
  );
}

function SkillRow({ label, skills, tone }: { label: string; skills: string[]; tone: "matched" | "neutral" | "missing" }) {
  if (!skills.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      {skills.map((s) => (
        <Pill key={s} tone={tone}>{s}</Pill>
      ))}
    </div>
  );
}

function Listing({ item, country, attribution }: { item: JobListing; country: string; attribution: string }) {
  const pay = salary(item, country);
  return (
    <Card className="lift">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-display text-headline-sm text-on-surface hover:text-primary hover:underline">
            {item.title}
          </a>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {[item.company, item.location].filter(Boolean).join(" · ") || "Company not listed"}
            {item.created ? ` · posted ${formatDate(item.created)}` : ""}
          </p>
          {pay ? <p className="mt-0.5 text-body-sm text-on-surface">{pay}</p> : null}
        </div>
        {/* Adzuna's terms: every listing carries an "Adzuna" link at least 116 x 23 px. */}
        <a
          href={attribution}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-[24px] min-w-[116px] items-center justify-center rounded-control border border-hairline px-2 text-label-sm font-semibold text-on-surface-variant hover:text-on-surface"
        >
          Jobs by Adzuna
        </a>
      </div>
      {item.description ? <p className="mt-3 line-clamp-3 text-body-md text-on-surface-variant">{item.description}</p> : null}
      <div className="mt-3 space-y-1.5">
        <SkillRow label="Your resume shows" skills={item.shown_skills} tone="matched" />
        <SkillRow label="Listed only" skills={item.listed_skills} tone="neutral" />
        <SkillRow label="Not on your resume" skills={item.missing_skills} tone="missing" />
      </div>
      <div className="mt-4">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
          View posting <ExternalLink className="size-4" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </Card>
  );
}
