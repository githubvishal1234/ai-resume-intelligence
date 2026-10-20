import { Check, Copy, MapPin } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { useResume, useResumeList } from "@/hooks/useResumes";
import { cn } from "@/lib/cn";
import { ABOUT_LIMIT, draftProfile, HEADLINE_LIMIT, PROFILE_VERSION } from "@/lib/profileDraft";
import { PageHeader } from "@/pages/resumes/common";
import type { ResumeDoc } from "@/services/resumeService";

export function ProfileBuilderPage() {
  const list = useResumeList();
  const [picked, setPicked] = useState("");
  if (list.isPending) return <PageLoading label="Loading your resumes" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const resumes = [...list.data].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "master" ? -1 : 1));
  const id = picked || resumes[0]?.id || "";

  return (
    <div>
      <PageHeader
        title="Profile Builder"
        photo="signin"
        description="A headline and About section for your professional profile, written from your resume's own words. Edit, then copy."
      />
      {resumes.length === 0 ? (
        <EmptyState
          title="Add your master resume first"
          description="The profile is drafted from it, so every line is something your resume already says."
          action={<ButtonLink to="/resumes/upload" variant="primary">Upload resume</ButtonLink>}
        />
      ) : (
        <>
          <div className="mb-6 max-w-md">
            <Field label="Resume">
              {({ id: fid }) => (
                <Select id={fid} value={id} onChange={(e) => setPicked(e.target.value)}>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kind === "master" ? "Master: " : "Tailored: "}
                      {r.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Drafts key={id} resumeId={id} />
        </>
      )}
    </div>
  );
}

function Drafts({ resumeId }: { resumeId: string }) {
  const resume = useResume(resumeId);
  if (resume.isPending) return <PageLoading label="Drafting your profile" />;
  if (resume.isError) return <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />;
  return <Editor doc={resume.data.content} />;
}

function Editor({ doc }: { doc: ResumeDoc }) {
  const draft = draftProfile(doc);
  const [choice, setChoice] = useState(0);
  const [headline, setHeadline] = useState(draft.headlines[0] ?? "");
  const [about, setAbout] = useState(draft.about);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-6">
        <Card aria-labelledby="headline-title">
          <CardHeader id="headline-title" title="Headline" description="Shown under your name everywhere. Pick a starting point, then make it yours." />
          {draft.headlines.length ? (
            <fieldset className="mb-4">
              <legend className="sr-only">Headline options</legend>
              <div className="space-y-2">
                {draft.headlines.map((h, i) => (
                  <label
                    key={h}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border p-3 text-body-md has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                      choice === i ? "border-primary bg-primary-fixed text-on-primary-fixed" : "border-hairline text-on-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="headline"
                      className="mt-1 accent-primary"
                      checked={choice === i}
                      onChange={() => {
                        setChoice(i);
                        setHeadline(h);
                      }}
                    />
                    {h}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="mb-4 text-body-md text-on-surface-variant">Add a current role and a few skills to your resume to get headline options.</p>
          )}
          <Field label="Your headline">
            {({ id }) => <Input id={id} value={headline} maxLength={HEADLINE_LIMIT} onChange={(e) => setHeadline(e.target.value)} />}
          </Field>
          <Footer count={headline.length} limit={HEADLINE_LIMIT} text={headline} what="headline" />
        </Card>

        <Card aria-labelledby="about-title">
          <CardHeader id="about-title" title="About" description="Your summary, your latest role in the first person, then earlier roles, skills and certifications." />
          <Field label="Your About section">
            {({ id }) => <Textarea id={id} rows={14} maxLength={ABOUT_LIMIT} value={about} onChange={(e) => setAbout(e.target.value)} />}
          </Field>
          <Footer count={about.length} limit={ABOUT_LIMIT} text={about} what="About section" />
        </Card>

        {draft.skills.length ? (
          <Card aria-labelledby="skills-title">
            <CardHeader id="skills-title" title="Top skills" description="Skills your experience actually shows come first. Profiles usually feature five." />
            <ul className="flex flex-wrap gap-2">
              {draft.skills.map((s) => (
                <li key={s}>
                  <Pill tone="brand">{s}</Pill>
                </li>
              ))}
            </ul>
            <Footer text={draft.skills.join(", ")} what="skills" />
          </Card>
        ) : null}
        <p className="font-mono text-label-sm text-on-surface-variant">
          Method {PROFILE_VERSION}: your resume's own wording, rearranged in your browser. Nothing is saved or sent anywhere.
        </p>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-label-md text-on-surface-variant">Preview</p>
        <ProfilePreview doc={doc} headline={headline} about={about} skills={draft.skills} />
      </div>
    </div>
  );
}

function Footer({ text, what, count, limit }: { text: string; what: string; count?: number; limit?: number }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" onClick={() => void copy()} icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}>
        {copied ? "Copied" : `Copy ${what}`}
      </Button>
      <span role="status" className="text-body-sm text-critical-ink">{failed ? "Couldn't copy. Select the text and copy it yourself." : ""}</span>
      {limit != null && count != null ? (
        <span className={cn("tnum ml-auto font-mono text-label-sm", count > limit * 0.95 ? "text-warning-ink" : "text-on-surface-variant")}>
          {count}/{limit}
        </span>
      ) : null}
    </div>
  );
}

function ProfilePreview({ doc, headline, about, skills }: { doc: ResumeDoc; headline: string; about: string; skills: string[] }) {
  const [more, setMore] = useState(false);
  const name = doc.contact.full_name || "Your name";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <section aria-label="Profile preview" className="overflow-hidden rounded-card border border-hairline bg-surface-container-lowest shadow-level-2">
      <div aria-hidden className="h-20 bg-[linear-gradient(120deg,var(--color-band),var(--color-ink-deep-indigo))]" />
      <div className="px-5 pb-5">
        <div aria-hidden className="-mt-10 flex size-20 items-center justify-center rounded-full border-4 border-surface-container-lowest bg-primary-fixed font-display text-headline-md text-on-primary-fixed">
          {initials}
        </div>
        <p className="mt-2 font-display text-headline-sm text-on-surface">{name}</p>
        <p className="mt-0.5 text-body-md text-on-surface">{headline || "Your headline"}</p>
        {doc.contact.location ? (
          <p className="mt-1 inline-flex items-center gap-1 text-body-sm text-on-surface-variant">
            <MapPin className="size-3.5" aria-hidden /> {doc.contact.location}
          </p>
        ) : null}
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="text-label-md font-semibold text-on-surface">About</p>
          <p className={cn("mt-1 whitespace-pre-line text-body-sm text-on-surface", !more && "line-clamp-4")}>{about || "Your About section"}</p>
          {about.split("\n").length > 4 || about.length > 240 ? (
            <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 min-h-6 text-label-md text-primary hover:underline">
              {more ? "See less" : "See more"}
            </button>
          ) : null}
        </div>
        {skills.length ? (
          <div className="mt-3 border-t border-hairline pt-3">
            <p className="text-label-md font-semibold text-on-surface">Top skills</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">{skills.join(" · ")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
