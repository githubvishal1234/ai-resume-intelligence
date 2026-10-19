import type { ResumeDoc } from "@/services/resumeService";

/**
 * Recruiter 6-second scan (`scan-v1`): a heuristic, not a measurement.
 *
 * Published eye-tracking studies of recruiters describe a quick F-shaped pass: name and
 * current title first, then the latest role's dates and company, then the first words of a
 * few bullets down the left edge. These checks ask whether what matters most sits where that
 * pass lands. Each one says why it matters and how to fix it; nothing here is scored by AI.
 */
export const SCAN_VERSION = "scan-v1";

export type ScanCheck = { id: string; ok: boolean; label: string; detail: string; weight: number };
export type ScanResult = { score: number; checks: ScanCheck[] };

const WEAK = /^(responsible for|worked on|helped|assisted|participated in|duties included|tasked with|involved in|in charge of)\b/i;
const NUMBER = /\d/;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export function scanResume(doc: ResumeDoc): ScanResult {
  const latest = doc.experience[0];
  const bullets = doc.experience.flatMap((e) => e.bullets).map((b) => b.trim()).filter(Boolean);
  const firstBullet = latest?.bullets.find((b) => b.trim())?.trim() ?? "";
  const summaryWords = words(doc.summary).length;
  const weak = bullets.filter((b) => WEAK.test(b));
  const withNumbers = bullets.filter((b) => NUMBER.test(b)).length;
  const long = bullets.filter((b) => words(b).length > 32);

  const checks: ScanCheck[] = [
    {
      id: "header",
      weight: 2,
      ok: Boolean(doc.contact.full_name.trim()) && Boolean(doc.contact.email.trim() || doc.contact.phone.trim()),
      label: "Name and a way to reach you at the very top",
      detail: "The first fixation lands on the name. Without an email or phone beside it, a busy reader moves on.",
    },
    {
      id: "summary",
      weight: 2,
      ok: summaryWords <= 60,
      label: summaryWords ? `Summary is ${summaryWords} words` : "No summary, latest role starts high",
      detail: "Over about 60 words, the summary pushes your latest role below the first glance. Keep it to two or three lines.",
    },
    {
      id: "latest-role",
      weight: 3,
      ok: Boolean(latest && latest.title.trim() && latest.company.trim() && (latest.start_date.trim() || latest.current)),
      label: "Latest role shows title, company and dates",
      detail: "Recruiters check the current title, employer and dates before anything else in the body.",
    },
    {
      id: "first-bullet",
      weight: 3,
      ok: Boolean(firstBullet) && !WEAK.test(firstBullet) && NUMBER.test(firstBullet),
      label: firstBullet ? "Latest role's first bullet leads with a result" : "Latest role has no bullets",
      detail: "The first bullet of your latest role is the one most likely to be read. Start with a strong verb and include a number.",
    },
    {
      id: "weak-openers",
      weight: 2,
      ok: weak.length === 0,
      label: weak.length ? `${weak.length} bullet${weak.length === 1 ? "" : "s"} open with a duty, not an outcome` : "Bullets open with actions",
      detail: weak.length
        ? `Skimmers read the first two or three words. Rewrite openers like “${words(weak[0]!).slice(0, 3).join(" ")}…” as what you achieved.`
        : "No “Responsible for” or “Helped with” openers.",
    },
    {
      id: "numbers",
      weight: 2,
      ok: bullets.length > 0 && withNumbers / bullets.length >= 0.4,
      label: `${withNumbers} of ${bullets.length} bullets contain a number`,
      detail: "Numbers stop the eye. Aim for at least two in five bullets with a figure: size, time, money or percent.",
    },
    {
      id: "length",
      weight: 1,
      ok: long.length === 0,
      label: long.length ? `${long.length} bullet${long.length === 1 ? " is" : "s are"} over 32 words` : "Bullets are skimmable",
      detail: "Long bullets get skipped in a scan. Split them, or cut to the result.",
    },
    {
      id: "skills",
      weight: 1,
      ok: doc.skills.length > 0,
      label: doc.skills.length ? `${doc.skills.length} skills listed` : "No skills section",
      detail: "A short skills list lets a scanner confirm the keywords from the posting at a glance.",
    },
  ];
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const passed = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
  return { score: Math.round((passed / total) * 100), checks };
}
