/**
 * Photos are bundled (not hotlinked) because the CSP only allows same-origin images, and so
 * users' browsers never contact a third party. All are under the Unsplash License; credits are
 * in src/assets/images/CREDITS.md. They are decorative: the text next to them carries the meaning.
 *
 * Each photo has a 1600px original and an 800px copy (`*-800.webp`, about a fifth of the bytes).
 * Small frames use the copy; large ones pass `photoSrcSet` so the browser picks by size.
 */
import analysis from "@/assets/images/analysis.webp";
import analysisSm from "@/assets/images/analysis-800.webp";
import builder from "@/assets/images/builder.webp";
import builderSm from "@/assets/images/builder-800.webp";
import insights from "@/assets/images/insights.webp";
import insightsSm from "@/assets/images/insights-800.webp";
import market from "@/assets/images/market.webp";
import marketSm from "@/assets/images/market-800.webp";
import match from "@/assets/images/match.webp";
import matchSm from "@/assets/images/match-800.webp";
import proofs from "@/assets/images/proofs.webp";
import proofsSm from "@/assets/images/proofs-800.webp";
import applications from "@/assets/images/applications.webp";
import applicationsSm from "@/assets/images/applications-800.webp";
import dashboard from "@/assets/images/dashboard.webp";
import dashboardSm from "@/assets/images/dashboard-800.webp";
import interview from "@/assets/images/interview.webp";
import interviewSm from "@/assets/images/interview-800.webp";
import jobs from "@/assets/images/jobs.webp";
import jobsSm from "@/assets/images/jobs-800.webp";
import register from "@/assets/images/register.webp";
import registerSm from "@/assets/images/register-800.webp";
import resumes from "@/assets/images/resumes.webp";
import resumesSm from "@/assets/images/resumes-800.webp";
import signin from "@/assets/images/signin.webp";
import signinSm from "@/assets/images/signin-800.webp";

export const PHOTOS = {
  analysis,
  applications,
  builder,
  dashboard,
  insights,
  interview,
  jobs,
  market,
  match,
  proofs,
  register,
  resumes,
  signin,
} as const;
export type PhotoName = keyof typeof PHOTOS;

export const PHOTOS_SMALL: Record<PhotoName, string> = {
  analysis: analysisSm,
  applications: applicationsSm,
  builder: builderSm,
  dashboard: dashboardSm,
  insights: insightsSm,
  interview: interviewSm,
  jobs: jobsSm,
  market: marketSm,
  match: matchSm,
  proofs: proofsSm,
  register: registerSm,
  resumes: resumesSm,
  signin: signinSm,
};

export function photoSrcSet(name: PhotoName) {
  return `${PHOTOS_SMALL[name]} 800w, ${PHOTOS[name]} 1600w`;
}
