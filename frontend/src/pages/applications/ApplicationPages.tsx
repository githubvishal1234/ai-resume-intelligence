import { BriefcaseBusiness, ExternalLink, PenLine, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import {
  useAddApplicationNote,
  useApplication,
  useApplicationList,
  useCreateApplication,
  useDeleteApplication,
  useSetApplicationStatus,
  useUpdateApplication,
} from "@/hooks/useApplications";
import { cn } from "@/lib/cn";
import {
  CLOSED,
  STATUS_LABEL,
  STATUSES,
  type ApplicationDetail,
  type ApplicationEvent,
  type ApplicationStatus,
  type ApplicationSummary,
} from "@/services/applicationService";
import { formatDate, PageHeader } from "@/pages/resumes/common";
import { ApplicationForm, toValues } from "./ApplicationForm";

export const STATUS_TONE: Record<ApplicationStatus, PillTone> = {
  saved: "neutral",
  applied: "info",
  screening: "info",
  interviewing: "brand",
  offer: "matched",
  accepted: "matched",
  rejected: "critical",
  withdrawn: "neutral",
};

/** Dates without a time ("2026-10-12") are shown as calendar dates, never shifted by time zone. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]} mono={false}>
      {STATUS_LABEL[status]}
    </Pill>
  );
}

// ---- list ------------------------------------------------------------------------------
type Filter = "open" | "all" | ApplicationStatus;

export function ApplicationsPage() {
  const list = useApplicationList();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("status") ?? "open") as Filter;
  if (list.isPending) return <PageLoading label="Loading applications" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const all = list.data;
  const count = (f: Filter) =>
    f === "all" ? all.length : f === "open" ? all.filter((a) => !CLOSED.has(a.status)).length : all.filter((a) => a.status === f).length;
  const shown = all.filter((a) => (filter === "all" ? true : filter === "open" ? !CLOSED.has(a.status) : a.status === filter));
  const filters: Filter[] = ["open", "all", ...STATUSES.filter((s) => count(s) > 0)];
  const label = (f: Filter) => (f === "open" ? "Open" : f === "all" ? "All" : STATUS_LABEL[f]);
  const addButton = (
    <ButtonLink to="/applications/new" variant="primary">
      <Plus className="size-4" aria-hidden /> Track an application
    </ButtonLink>
  );

  return (
    <div>
      <PageHeader
        title="Applications"
        photo="applications"
        description="Every job you're pursuing, the resume version you sent, and what happened next."
        actions={all.length ? addButton : null}
      />
      {all.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness className="size-8" aria-hidden />}
          title="No applications yet"
          description="Track a job you've applied to, or plan to, and set a follow-up date to get a reminder."
          action={addButton}
        />
      ) : (
        <>
          <nav aria-label="Filter applications" className="mb-4 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setParams(f === "open" ? {} : { status: f }, { replace: true })}
                className={cn(
                  "rounded-full border px-3 py-1 text-label-md transition-colors",
                  filter === f
                    ? "border-primary bg-primary-fixed text-on-primary-fixed"
                    : "border-hairline bg-surface-container-lowest text-on-surface-variant hover:border-primary",
                )}
              >
                {label(f)} <span className="font-mono text-code-sm">{count(f)}</span>
              </button>
            ))}
          </nav>
          {shown.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No applications in this view.</p>
          ) : (
            <ul className="space-y-3">
              {shown.map((a) => (
                <li key={a.id}>
                  <ApplicationCard application={a} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ApplicationCard({ application: a }: { application: ApplicationSummary }) {
  return (
    <Card className="relative hover:border-primary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/applications/${a.id}`}
            className="font-display text-headline-sm text-on-surface after:absolute after:inset-0 hover:text-primary"
          >
            {a.role}
          </Link>
          <p className="mt-1 text-body-md text-on-surface-variant">{a.company}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {a.applied_on ? `Applied ${formatDay(a.applied_on)}` : `Added ${formatDate(a.created_at)}`}
            {a.resume_title ? ` · ${a.resume_title} v${a.resume_version}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.follow_up_due ? (
            <Pill tone="missing" mono={false}>
              Follow up due
            </Pill>
          ) : a.follow_up_on && !CLOSED.has(a.status) ? (
            <Pill mono={false}>Follow up {formatDay(a.follow_up_on)}</Pill>
          ) : null}
          <StatusPill status={a.status} />
        </div>
      </div>
    </Card>
  );
}

// ---- create ----------------------------------------------------------------------------
export function ApplicationNewPage() {
  const [params] = useSearchParams();
  const create = useCreateApplication();
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Track an application" back={{ to: "/applications", label: "Applications" }} />
      <Card>
        <ApplicationForm
          initial={toValues(undefined, params.get("job") ?? undefined)}
          submitLabel="Save application"
          pending={create.isPending}
          onSubmit={async (input) => {
            const created = await create.mutateAsync(input);
            navigate(`/applications/${created.id}`, { replace: true });
          }}
        />
      </Card>
    </div>
  );
}

// ---- detail ----------------------------------------------------------------------------
export function ApplicationDetailPage() {
  const { applicationId = "" } = useParams();
  const application = useApplication(applicationId);
  const [editing, setEditing] = useState(false);
  if (application.isPending) return <PageLoading label="Loading application" />;
  if (application.isError) return <ErrorState error={application.error} onRetry={() => void application.refetch()} />;
  const a = application.data;

  return (
    <div>
      <PageHeader
        title={a.role}
        description={a.company}
        back={{ to: "/applications", label: "Applications" }}
        actions={
          editing ? null : (
            <Button variant="secondary" icon={<PenLine className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )
        }
      />
      {a.follow_up_due ? (
        <Notice tone="warning" title="Follow-up due" className="mb-6">
          You planned to follow up on {formatDay(a.follow_up_on ?? "")}. Move the date or the status once you have.
        </Notice>
      ) : null}
      {editing ? (
        <EditApplication application={a} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <StatusCard application={a} />
            <DetailsCard application={a} />
          </div>
          <Timeline application={a} />
        </div>
      )}
      <DeleteApplication application={a} />
    </div>
  );
}

function StatusCard({ application: a }: { application: ApplicationDetail }) {
  const id = useId();
  const setStatus = useSetApplicationStatus(a.id);
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader id={`${id}-t`} title="Status" description="Each change is added to the history." />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${id}-s`} className="sr-only">
          Change status
        </label>
        <Select
          id={`${id}-s`}
          value={a.status}
          disabled={setStatus.isPending}
          onChange={(e) => setStatus.mutate(e.target.value as ApplicationStatus)}
          className="max-w-56"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <StatusPill status={a.status} />
      </div>
      {setStatus.isError ? (
        <p role="alert" className="mt-2 text-body-sm text-critical">
          The status could not be changed. Please try again.
        </p>
      ) : null}
    </Card>
  );
}

function DetailsCard({ application: a }: { application: ApplicationDetail }) {
  const id = useId();
  const rows: [string, ReactNode][] = [
    ["Applied on", a.applied_on ? formatDay(a.applied_on) : "Not yet"],
    ["Follow up on", a.follow_up_on ? formatDay(a.follow_up_on) : "Not set"],
    [
      "Job",
      a.job_id ? (
        <span className="flex flex-wrap gap-x-3">
          <Link to={`/jobs/${a.job_id}`} className="text-primary hover:underline">
            {a.job_title ?? "Saved job"}
          </Link>
          <Link to={`/jobs/${a.job_id}/match`} className="text-primary hover:underline">
            Match
          </Link>
        </span>
      ) : (
        "Not linked"
      ),
    ],
    [
      "Resume sent",
      a.resume_id ? (
        <Link to={`/resumes/${a.resume_id}/versions`} className="text-primary hover:underline">
          {a.resume_title ?? "Resume"} · version {a.resume_version}
        </Link>
      ) : (
        "Not recorded"
      ),
    ],
  ];
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader id={`${id}-t`} title="Details" />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body-md">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-on-surface-variant">{k}</dt>
            <dd className="min-w-0 text-on-surface">{v}</dd>
          </div>
        ))}
        {a.url ? (
          <div className="contents">
            <dt className="text-on-surface-variant">Posting</dt>
            <dd className="min-w-0 break-all">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {a.url} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {a.notes ? (
        <div className="mt-4 border-t border-hairline pt-4">
          <h3 className="text-label-md text-on-surface">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-body-md text-on-surface">{a.notes}</p>
        </div>
      ) : null}
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  company: "company",
  role: "role",
  url: "link",
  job_id: "linked job",
  resume_id: "resume",
  resume_version: "resume version",
  applied_on: "applied date",
  follow_up_on: "follow-up date",
  notes: "notes",
};

function describe(e: ApplicationEvent): string {
  if (e.kind === "created") return `Added as ${STATUS_LABEL[e.to_status ?? "saved"]}`;
  if (e.kind === "status") return `${STATUS_LABEL[e.from_status ?? "saved"]} → ${STATUS_LABEL[e.to_status ?? "saved"]}`;
  if (e.kind === "edited") return `Changed ${e.fields.map((f) => FIELD_LABEL[f] ?? f).join(", ")}`;
  return "Note";
}

function Timeline({ application: a }: { application: ApplicationDetail }) {
  const id = useId();
  const addNote = useAddApplicationNote(a.id);
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    addNote.mutate(note, { onSuccess: () => setNote("") });
  };
  return (
    <Card aria-labelledby={`${id}-t`}>
      <CardHeader id={`${id}-t`} title="History" description="Newest first. History can't be edited." />
      <form onSubmit={submit} className="mb-5 space-y-2">
        <label htmlFor={`${id}-n`} className="block text-label-md text-on-surface">
          Add a note
        </label>
        <Textarea
          id={`${id}-n`}
          rows={2}
          className="min-h-20"
          value={note}
          maxLength={5000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Recruiter call, interview feedback, next step…"
        />
        {addNote.isError ? (
          <p role="alert" className="text-body-sm text-critical">
            The note could not be saved. Please try again.
          </p>
        ) : null}
        <Button type="submit" size="sm" loading={addNote.isPending} disabled={!note.trim()}>
          Add note
        </Button>
      </form>
      <ol className="space-y-4 border-l border-hairline pl-4">
        {a.events.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface-container-lowest bg-primary" />
            <p className="text-label-md text-on-surface">{describe(e)}</p>
            {e.note ? <p className="mt-0.5 whitespace-pre-wrap break-words text-body-md text-on-surface">{e.note}</p> : null}
            <p className="text-body-sm text-on-surface-variant">{formatDate(e.created_at)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function EditApplication({ application: a, onDone }: { application: ApplicationDetail; onDone: () => void }) {
  const update = useUpdateApplication(a.id);
  return (
    <Card className="mb-6 max-w-3xl" aria-label="Edit details">
      <ApplicationForm
        initial={toValues(a)}
        submitLabel="Save changes"
        pending={update.isPending}
        onCancel={onDone}
        onSubmit={async (input) => {
          await update.mutateAsync(input);
          onDone();
        }}
      />
    </Card>
  );
}

function DeleteApplication({ application }: { application: ApplicationDetail }) {
  const remove = useDeleteApplication(application.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="mt-8" aria-labelledby="danger-title">
      <h2 id="danger-title" className="mb-2 text-label-md text-on-surface">
        Delete
      </h2>
      {confirming ? (
        <Notice
          tone="critical"
          title="Delete this application?"
          action={
            <div className="flex gap-2">
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/applications", { replace: true }) })}
              >
                Delete application
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          }
        >
          The application, its history and its reminders are removed. The job and resume stay. This cannot be undone.
        </Notice>
      ) : (
        <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
          Delete application
        </Button>
      )}
    </section>
  );
}

