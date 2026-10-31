/**
 * Writing helpers for the quick builder. Everything here is deterministic and works only with
 * what the user typed: nothing is invented, and drafts are always shown for the user to edit.
 */
import type { ResumeDoc } from "@/services/resumeService";

export type StepId = "style" | "contact" | "experience" | "projects" | "education" | "skills" | "summary" | "finish";

export type Check = { id: string; label: string; ok: boolean; step: StepId; hint: string };

const hasNumber = (s: string) => /\d/.test(s);

/**
 * What a solid one-page resume needs, in the order the builder asks for it. Sections the user
 * chose to skip are left out, so they neither count against them nor get flagged.
 */
export function resumeChecklist(doc: ResumeDoc, skipped: readonly StepId[] = []): Check[] {
  const c = doc.contact;
  const roles = doc.experience.filter((e) => e.title.trim() || e.company.trim());
  const bullets = doc.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter(hasNumber).length;
  const summaryLength = doc.summary.trim().length;
  const checks: Check[] = [
    { id: "name", label: "Name and email", ok: Boolean(c.full_name.trim() && c.email.trim()), step: "contact", hint: "Recruiters need both to reach you." },
    { id: "reach", label: "Phone or location", ok: Boolean(c.phone.trim() || c.location.trim()), step: "contact", hint: "Add at least one; many roles filter by location." },
    { id: "role", label: "At least one role with title and company", ok: roles.some((e) => e.title.trim() && e.company.trim()), step: "experience", hint: "Internships and part-time work count." },
    { id: "bullets", label: "Two or more bullet points per role", ok: roles.length > 0 && roles.every((e) => e.bullets.length >= 2), step: "experience", hint: "Describe what you achieved, one point per line." },
    { id: "numbers", label: "Half your bullet points include a number", ok: bullets.length > 0 && quantified * 2 >= bullets.length, step: "experience", hint: "Percentages, money, time saved, users or team size." },
    { id: "project", label: "A project with what you built", ok: doc.projects.some((p) => p.name.trim() && p.bullets.length > 0), step: "projects", hint: "Personal, academic or open-source work counts. No projects? Skip the section." },
    { id: "education", label: "Education", ok: doc.education.some((e) => e.institution.trim() || e.degree.trim()), step: "education", hint: "Your highest degree or most relevant course." },
    { id: "skills", label: "Five or more skills", ok: doc.skills.length >= 5, step: "skills", hint: "Use the words job postings use." },
    { id: "summary", label: "A short summary", ok: summaryLength >= 60 && summaryLength <= 700, step: "summary", hint: "Two to four sentences about who you are and what you bring." },
  ];
  return checks.filter((c) => !skipped.includes(c.step));
}

/** Steps whose section can be skipped while it is still empty. */
export const SKIPPABLE: readonly StepId[] = ["experience", "projects", "education", "skills", "summary"];

export function isSectionEmpty(doc: ResumeDoc, step: StepId): boolean {
  switch (step) {
    case "experience":
      return !doc.experience.some((e) => e.title.trim() || e.company.trim());
    case "projects":
      return !doc.projects.some((p) => p.name.trim());
    case "education":
      return !doc.education.some((e) => e.institution.trim() || e.degree.trim());
    case "skills":
      return doc.skills.length === 0;
    case "summary":
      return !doc.summary.trim();
    default:
      return false;
  }
}

export function completeness(doc: ResumeDoc, skipped: readonly StepId[] = []): number {
  const checks = resumeChecklist(doc, skipped);
  return Math.round((100 * checks.filter((c) => c.ok).length) / checks.length);
}

const WEAK_OPENERS = /^(i\s|i'm\s|my\s|responsible for|worked on|helped|duties included|tasked with)/i;

/** Tips for one bullet point; empty when it already reads well. */
export function bulletTips(line: string): string[] {
  const text = line.trim();
  if (!text) return [];
  const tips: string[] = [];
  if (WEAK_OPENERS.test(text)) tips.push("Start with an action verb, such as “Led” or “Built”.");
  if (!hasNumber(text)) tips.push("Add a number if you can: %, time, money, users or team size.");
  if (text.length > 220) tips.push("Shorten it to one or two lines.");
  return tips;
}

export const ACTION_VERBS = ["Led", "Built", "Designed", "Launched", "Improved", "Reduced", "Increased", "Automated", "Managed", "Delivered", "Analyzed", "Negotiated"];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as a month count (year * 12 + month). When only the year is known, the reading that
 * gives the shortest experience is used (a start in December, an end in January), so the
 * drafted "N+ years" never overstates.
 */
function monthIndex(value: string, edge: "start" | "end", now: Date): number | null {
  const v = value.trim().toLowerCase();
  if (/^(present|current|now)$/.test(v)) return now.getFullYear() * 12 + now.getMonth();
  const named = /([a-z]{3})[a-z]*\.?\s*,?\s*((?:19|20)\d{2})/.exec(v);
  if (named && MONTHS.includes(named[1]!)) return Number(named[2]) * 12 + MONTHS.indexOf(named[1]!);
  const numeric = /\b(\d{1,2})\s*[/.-]\s*((?:19|20)\d{2})\b/.exec(v);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) return Number(numeric[2]) * 12 + Number(numeric[1]) - 1;
  const year = /\b((?:19|20)\d{2})\b/.exec(v);
  if (year) return Number(year[1]) * 12 + (edge === "start" ? 11 : 0);
  return null;
}

/** Whole years from the earliest dated start to the latest dated end; null when unknown or under a year. */
function years(doc: ResumeDoc, now = new Date()): number | null {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const e of doc.experience) {
    const start = monthIndex(e.start_date, "start", now);
    const end = e.current ? now.getFullYear() * 12 + now.getMonth() : monthIndex(e.end_date, "end", now);
    if (start !== null && end !== null && end >= start) {
      starts.push(start);
      ends.push(end);
    }
  }
  if (!starts.length) return null;
  const span = Math.floor((Math.max(...ends) - Math.min(...starts)) / 12);
  return span >= 1 ? span : null;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A first-draft summary assembled only from the user's own entries (latest title, the span of
 * their dated roles, latest employer, top skills, degree). Returns "" when there is too little.
 */
export function draftSummary(doc: ResumeDoc, now = new Date()): string {
  const latest = doc.experience.find((e) => e.title.trim());
  const span = years(doc, now);
  const skills = doc.skills.slice(0, 4).map((s) => s.name);
  const degree = doc.education.find((e) => e.degree.trim());
  const sentences: string[] = [];
  if (latest) {
    let first = latest.title.trim();
    if (span) first += ` with ${span}+ years of experience`;
    if (latest.company.trim()) first += `${span ? "," : ""} ${latest.current ? "currently" : "most recently"} at ${latest.company.trim()}`;
    sentences.push(`${first}.`);
  }
  if (skills.length) sentences.push(`Skilled in ${list(skills)}.`);
  if (degree) {
    const field = degree.field_of_study.trim() ? ` in ${degree.field_of_study.trim()}` : "";
    const school = degree.institution.trim() ? ` from ${degree.institution.trim()}` : "";
    sentences.push(`Holds a ${degree.degree.trim()}${field}${school}.`);
  }
  return sentences.length >= 2 ? sentences.join(" ") : "";
}

/** Common skills by field, offered as one-click additions. The user picks only what is true. */
export const SKILL_PRESETS: Record<string, string[]> = {
  "Software engineering": ["Python", "JavaScript", "TypeScript", "Java", "SQL", "React", "Node.js", "REST APIs", "Git", "Docker", "AWS", "Unit testing"],
  "Data & analytics": ["SQL", "Python", "Excel", "Power BI", "Tableau", "Statistics", "pandas", "Data visualization", "A/B testing", "Machine learning", "ETL", "Dashboards"],
  "Product & project management": ["Roadmapping", "Agile", "Scrum", "Jira", "Stakeholder management", "User research", "Requirements gathering", "Prioritization", "Risk management", "Budgeting", "OKRs", "Confluence"],
  Design: ["Figma", "UX research", "Wireframing", "Prototyping", "Design systems", "Usability testing", "Visual design", "Interaction design", "Accessibility", "Adobe Illustrator", "Photoshop", "User flows"],
  Marketing: ["SEO", "Content marketing", "Google Analytics", "Social media", "Email marketing", "Copywriting", "Paid search", "Campaign management", "Marketing automation", "HubSpot", "Brand strategy", "Market research"],
  "Sales & customer success": ["CRM", "Salesforce", "Lead generation", "Negotiation", "Account management", "Customer onboarding", "Pipeline management", "Cold outreach", "Presentations", "Upselling", "Customer retention", "Forecasting"],
  "Finance & accounting": ["Financial modeling", "Excel", "Budgeting", "Forecasting", "Accounts payable", "Accounts receivable", "Reconciliation", "GST", "Tally", "SAP", "Variance analysis", "Audit"],
  "HR & recruiting": ["Recruiting", "Interviewing", "Onboarding", "Employee relations", "Payroll", "HRIS", "Performance management", "Compliance", "Workday", "Training", "Sourcing", "Employer branding"],
  "Operations & supply chain": ["Process improvement", "Inventory management", "Logistics", "Vendor management", "Procurement", "Lean", "Six Sigma", "ERP", "Forecasting", "Quality control", "Scheduling", "Reporting"],
};

/** A fictional resume for template previews and the landing page. */
export const SAMPLE_RESUME: ResumeDoc = {
  contact: { full_name: "Aarav Mehta", headline: "", email: "aarav.mehta@example.com", phone: "+91 98765 43210", location: "Pune, India", links: ["linkedin.com/in/aarav-example"] },
  summary: "Backend engineer with 6+ years of experience, currently at Northwind Retail. Skilled in Python, PostgreSQL, AWS and Docker. Holds a B.Tech in Computer Science.",
  experience: [
    { id: "s-e1", title: "Senior Backend Engineer", company: "Northwind Retail", location: "Pune", start_date: "Mar 2022", end_date: "", current: true, bullets: ["Led the move of order processing to an event-driven service, cutting checkout errors by 38%.", "Built a PostgreSQL reporting layer used by 120 store managers every day.", "Mentored 4 engineers through code reviews and weekly pairing."] },
    { id: "s-e2", title: "Software Engineer", company: "Contoso Labs", location: "Bengaluru", start_date: "Jul 2019", end_date: "Feb 2022", current: false, bullets: ["Designed REST APIs serving 2M requests a day with 99.95% uptime.", "Automated deployments with Docker and GitHub Actions, saving 6 hours a week."] },
  ],
  education: [{ id: "s-d1", institution: "University of Pune", degree: "B.Tech", field_of_study: "Computer Science", start_date: "2015", end_date: "2019", details: [] }],
  skills: ["Python", "PostgreSQL", "AWS", "Docker", "REST APIs", "Kafka", "Git", "Unit testing"].map((name, i) => ({ id: `s-s${i}`, name, category: "" })),
  projects: [],
  certifications: [{ id: "s-c1", name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", date: "2023" }],
  other: [],
  section_order: [],
};
