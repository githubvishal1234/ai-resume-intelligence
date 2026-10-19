/**
 * Photos are bundled (not hotlinked) because the CSP only allows same-origin images, and so
 * users' browsers never contact a third party. All are under the Unsplash License; credits are
 * in src/assets/images/CREDITS.md. They are decorative: the text next to them carries the meaning.
 *
 * Each photo has a 1600px original and an 800px copy (`*-800.webp`, about a fifth of the bytes).
 * Small frames use the copy; large ones pass `photoSrcSet` so the browser picks by size.
 */
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

export const PHOTOS = { applications, dashboard, interview, jobs, register, resumes, signin } as const;
export type PhotoName = keyof typeof PHOTOS;

export const PHOTOS_SMALL: Record<PhotoName, string> = {
  applications: applicationsSm,
  dashboard: dashboardSm,
  interview: interviewSm,
  jobs: jobsSm,
  register: registerSm,
  resumes: resumesSm,
  signin: signinSm,
};

export function photoSrcSet(name: PhotoName) {
  return `${PHOTOS_SMALL[name]} 800w, ${PHOTOS[name]} 1600w`;
}
