/**
 * Photos are bundled (not hotlinked) because the CSP only allows same-origin images, and so
 * users' browsers never contact a third party. All are under the Unsplash License; credits are
 * in src/assets/images/CREDITS.md. They are decorative: the text next to them carries the meaning.
 */
import applications from "@/assets/images/applications.webp";
import dashboard from "@/assets/images/dashboard.webp";
import interview from "@/assets/images/interview.webp";
import jobs from "@/assets/images/jobs.webp";
import register from "@/assets/images/register.webp";
import resumes from "@/assets/images/resumes.webp";
import signin from "@/assets/images/signin.webp";

export const PHOTOS = { applications, dashboard, interview, jobs, register, resumes, signin } as const;
export type PhotoName = keyof typeof PHOTOS;
