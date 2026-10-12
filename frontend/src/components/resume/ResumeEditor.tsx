import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  newId,
  type Certification,
  type Education,
  type Experience,
  type ImportReport,
  type OtherSection,
  type Project,
  type ResumeDoc,
} from "@/services/resumeService";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { linesToList, listToLines, skillsToText, textToSkills } from "./editorText";

type Report = ImportReport["sections"][number];

/**
 * A textarea backed by structured data (e.g. one list item per line). It keeps the raw text the
 * user is typing (blank lines, trailing commas) and only resyncs when the data changed elsewhere.
 */
function TextBacked<T>({
  value,
  onChange,
  toText,
  fromText,
  ...rest
}: {
  value: T;
  onChange: (next: T) => void;
  toText: (value: T) => string;
  fromText: (text: string) => T;
  id: string;
  "aria-describedby"?: string;
  rows?: number;
}) {
  const [text, setText] = useState(() => toText(value));
  if (JSON.stringify(fromText(text)) !== JSON.stringify(value)) {
    const next = toText(value);
    if (next !== text) setText(next);
  }
  return (
    <Textarea
      {...rest}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(fromText(e.target.value));
      }}
    />
  );
}

function TextInput({ label, value, onChange, hint, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Input id={id} type={type} value={value} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function Section({ title, description, report, children, action }: {
  title: string;
  description?: string;
  report?: Report | undefined;
  children: ReactNode;
  action?: ReactNode;
}) {
  const headingId = `sec-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Card aria-labelledby={headingId}>
      <CardHeader
        id={headingId}
        title={title}
        description={description}
        action={
          <div className="flex items-center gap-2">
            {report ? <ConfidenceBadge level={report.confidence} /> : null}
            {action}
          </div>
        }
      />
      {report && report.notes.length > 0 ? (
        <Notice tone={report.confidence === "low" ? "warning" : "info"} title="Please check this section" className="mb-4">
          <ul className="list-disc pl-5">
            {report.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function EntryShell({ index, count, label, onMove, onRemove, children }: {
  index: number;
  count: number;
  label: string;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-control border border-hairline p-4">
      <legend className="px-1 text-label-md text-on-surface-variant">{label}</legend>
      <div className="mb-3 flex justify-end gap-1">
        <Button variant="ghost" size="sm" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)} icon={<ArrowUp className="size-4" aria-hidden />} />
        <Button variant="ghost" size="sm" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)} icon={<ArrowDown className="size-4" aria-hidden />} />
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`} onClick={onRemove} icon={<Trash2 className="size-4" aria-hidden />} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, i) => (i === index ? value : item));
}

function AreaField({ label, hint, value, onChange, rows = 4 }: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
}) {
  return (
    <div className="sm:col-span-2">
      <Field label={label} hint={hint}>
        {({ id, describedBy }) => (
          <TextBacked id={id} aria-describedby={describedBy} rows={rows} value={value} onChange={onChange} toText={listToLines} fromText={linesToList} />
        )}
      </Field>
    </div>
  );
}

const blankExperience = (): Experience => ({ id: newId(), title: "", company: "", location: "", start_date: "", end_date: "", current: false, bullets: [] });
const blankEducation = (): Education => ({ id: newId(), institution: "", degree: "", field_of_study: "", start_date: "", end_date: "", details: [] });
const blankProject = (): Project => ({ id: newId(), name: "", url: "", description: "", technologies: [], bullets: [] });
const blankCert = (): Certification => ({ id: newId(), name: "", issuer: "", date: "" });
const blankOther = (): OtherSection => ({ id: newId(), heading: "", lines: [] });

export function ResumeEditor({ value, onChange, report }: {
  value: ResumeDoc;
  onChange: (next: ResumeDoc) => void;
  report?: ImportReport | undefined;
}) {
  const r = (section: string) => report?.sections.find((s) => s.section === section);
  const set = <K extends keyof ResumeDoc>(key: K, v: ResumeDoc[K]) => onChange({ ...value, [key]: v });
  const c = value.contact;

  return (
    <div className="space-y-6">
      <Section title="Contact" report={r("contact")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Full name" value={c.full_name} onChange={(v) => set("contact", { ...c, full_name: v })} />
          <TextInput label="Email" type="email" value={c.email} onChange={(v) => set("contact", { ...c, email: v })} />
          <TextInput label="Phone" value={c.phone} onChange={(v) => set("contact", { ...c, phone: v })} />
          <TextInput label="Location" value={c.location} onChange={(v) => set("contact", { ...c, location: v })} />
          <AreaField label="Links" hint="One per line (LinkedIn, GitHub, portfolio)." rows={2} value={c.links} onChange={(v) => set("contact", { ...c, links: v })} />
        </div>
      </Section>

      <Section title="Summary" report={r("summary")}>
        <Field label="Professional summary" hint="2-4 sentences.">
          {({ id, describedBy }) => (
            <Textarea id={id} aria-describedby={describedBy} value={value.summary} onChange={(e) => set("summary", e.target.value)} />
          )}
        </Field>
      </Section>

      <Section
        title="Experience"
        report={r("experience")}
        action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("experience", [...value.experience, blankExperience()])}>Add role</Button>}
      >
        {value.experience.length === 0 ? <p className="text-body-md text-on-surface-variant">No roles yet.</p> : null}
        {value.experience.map((e, i) => {
          const update = (patch: Partial<Experience>) => set("experience", replaceAt(value.experience, i, { ...e, ...patch }));
          return (
            <EntryShell key={e.id} index={i} count={value.experience.length} label={e.title || `Role ${i + 1}`}
              onMove={(d) => set("experience", move(value.experience, i, d))}
              onRemove={() => set("experience", value.experience.filter((_, j) => j !== i))}>
              <TextInput label="Title" value={e.title} onChange={(v) => update({ title: v })} />
              <TextInput label="Company" value={e.company} onChange={(v) => update({ company: v })} />
              <TextInput label="Location" value={e.location} onChange={(v) => update({ location: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Start" value={e.start_date} onChange={(v) => update({ start_date: v })} />
                <TextInput label="End" value={e.current ? "Present" : e.end_date} onChange={(v) => update({ end_date: v })} />
              </div>
              <label className="flex items-center gap-2 text-body-md sm:col-span-2">
                <input type="checkbox" checked={e.current} onChange={(ev) => update({ current: ev.target.checked, end_date: ev.target.checked ? "Present" : "" })} />
                I currently work here
              </label>
              <AreaField label="Bullet points" hint="One achievement per line." rows={5} value={e.bullets} onChange={(v) => update({ bullets: v })} />
            </EntryShell>
          );
        })}
      </Section>

      <Section
        title="Education"
        report={r("education")}
        action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("education", [...value.education, blankEducation()])}>Add education</Button>}
      >
        {value.education.map((e, i) => {
          const update = (patch: Partial<Education>) => set("education", replaceAt(value.education, i, { ...e, ...patch }));
          return (
            <EntryShell key={e.id} index={i} count={value.education.length} label={e.institution || `Education ${i + 1}`}
              onMove={(d) => set("education", move(value.education, i, d))}
              onRemove={() => set("education", value.education.filter((_, j) => j !== i))}>
              <TextInput label="Institution" value={e.institution} onChange={(v) => update({ institution: v })} />
              <TextInput label="Degree" value={e.degree} onChange={(v) => update({ degree: v })} />
              <TextInput label="Field of study" value={e.field_of_study} onChange={(v) => update({ field_of_study: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Start" value={e.start_date} onChange={(v) => update({ start_date: v })} />
                <TextInput label="End" value={e.end_date} onChange={(v) => update({ end_date: v })} />
              </div>
              <AreaField label="Details" hint="GPA, honors, coursework. One per line." rows={2} value={e.details} onChange={(v) => update({ details: v })} />
            </EntryShell>
          );
        })}
      </Section>

      <Section title="Skills" report={r("skills")}>
        <Field label="Skills" hint='Comma separated. Optional groups, one per line: "Languages: Python, Go".'>
          {({ id, describedBy }) => (
            <TextBacked
              id={id}
              aria-describedby={describedBy}
              rows={5}
              value={value.skills}
              toText={skillsToText}
              fromText={(text) => textToSkills(text, value.skills)}
              onChange={(skills) => set("skills", skills)}
            />
          )}
        </Field>
      </Section>

      <Section
        title="Projects"
        report={r("projects")}
        action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("projects", [...value.projects, blankProject()])}>Add project</Button>}
      >
        {value.projects.map((p, i) => {
          const update = (patch: Partial<Project>) => set("projects", replaceAt(value.projects, i, { ...p, ...patch }));
          return (
            <EntryShell key={p.id} index={i} count={value.projects.length} label={p.name || `Project ${i + 1}`}
              onMove={(d) => set("projects", move(value.projects, i, d))}
              onRemove={() => set("projects", value.projects.filter((_, j) => j !== i))}>
              <TextInput label="Name" value={p.name} onChange={(v) => update({ name: v })} />
              <TextInput label="Link" value={p.url} onChange={(v) => update({ url: v })} />
              <div className="sm:col-span-2">
                <TextInput label="Technologies" hint="Comma separated." value={p.technologies.join(", ")}
                  onChange={(v) => update({ technologies: v.split(",").map((t) => t.trim()).filter(Boolean) })} />
              </div>
              <div className="sm:col-span-2">
                <Field label="Description">
                  {({ id }) => <Textarea id={id} value={p.description} onChange={(ev) => update({ description: ev.target.value })} />}
                </Field>
              </div>
              <AreaField label="Bullet points" rows={3} value={p.bullets} onChange={(v) => update({ bullets: v })} />
            </EntryShell>
          );
        })}
      </Section>

      <Section
        title="Certifications"
        report={r("certifications")}
        action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("certifications", [...value.certifications, blankCert()])}>Add certification</Button>}
      >
        {value.certifications.map((x, i) => {
          const update = (patch: Partial<Certification>) => set("certifications", replaceAt(value.certifications, i, { ...x, ...patch }));
          return (
            <EntryShell key={x.id} index={i} count={value.certifications.length} label={x.name || `Certification ${i + 1}`}
              onMove={(d) => set("certifications", move(value.certifications, i, d))}
              onRemove={() => set("certifications", value.certifications.filter((_, j) => j !== i))}>
              <TextInput label="Name" value={x.name} onChange={(v) => update({ name: v })} />
              <TextInput label="Issuer" value={x.issuer} onChange={(v) => update({ issuer: v })} />
              <TextInput label="Date" value={x.date} onChange={(v) => update({ date: v })} />
            </EntryShell>
          );
        })}
      </Section>

      <Section
        title="Other sections"
        description="Awards, languages, volunteering and anything else."
        action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("other", [...value.other, blankOther()])}>Add section</Button>}
      >
        {value.other.map((o, i) => {
          const update = (patch: Partial<OtherSection>) => set("other", replaceAt(value.other, i, { ...o, ...patch }));
          return (
            <EntryShell key={o.id} index={i} count={value.other.length} label={o.heading || `Section ${i + 1}`}
              onMove={(d) => set("other", move(value.other, i, d))}
              onRemove={() => set("other", value.other.filter((_, j) => j !== i))}>
              <div className="sm:col-span-2">
                <TextInput label="Heading" value={o.heading} onChange={(v) => update({ heading: v })} />
              </div>
              <AreaField label="Lines" rows={4} value={o.lines} onChange={(v) => update({ lines: v })} />
            </EntryShell>
          );
        })}
      </Section>
    </div>
  );
}
