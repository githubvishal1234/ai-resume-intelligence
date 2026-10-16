/**
 * Plans shown on /pricing. Prices are set here only (one edit to change them).
 * No payment provider is chosen yet: Pro is a waitlist, and plan limits are not enforced in the
 * app. When billing is added, the feature split below is what the backend should gate.
 */
export const CURRENCY = "INR";

export const PRO_PRICE = { monthly: 299, yearly: 2499 } as const;

/** Whole-percent saving of yearly over twelve monthly payments, rounded down so it never overstates. */
export const YEARLY_SAVING_PERCENT = Math.floor(100 * (1 - PRO_PRICE.yearly / (PRO_PRICE.monthly * 12)));

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(amount);
}

export const FREE_FEATURES = [
  "Quick builder with live preview",
  "All 6 ATS-safe templates",
  "PDF download with ATS check",
  "Import an existing resume (PDF, DOCX, TXT)",
  "Job analyzer, match score and skill gaps",
  "Fact-checked tailoring (rule-based)",
  "Application tracker with reminders",
  "Interview question sets and practice",
];

export const PRO_FEATURES = [
  "Everything in Free",
  "AI rewrites of your summary and bullet points, fact-checked against your resume",
  "AI-assisted resume import and job analysis",
  "AI interview questions and feedback on your answers",
  "A higher daily allowance of AI requests",
];
