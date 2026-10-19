import type { ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PageLoading } from "@/components/ui/States";
import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";

/**
 * Route-level code splitting: each screen loads on first visit. The shell, dashboard and
 * not-found page stay in the main bundle. The sign-in pages are split out too, so their form
 * libraries (zod, react-hook-form) stay off the landing page and the dashboard.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return { lazy: async () => ({ Component: (await load())[name] }) };
}

function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <PageLoading label="Loading the app" />
    </div>
  );
}

export const routes: RouteObject[] = [
  // Public product page; signed-out visitors to "/" land here (see RequireAuth).
  { path: "/welcome", HydrateFallback: AppLoading, ...page(() => import("@/pages/LandingPage"), "LandingPage") },
  { path: "/pricing", HydrateFallback: AppLoading, ...page(() => import("@/pages/PricingPage"), "PricingPage") },
  {
    HydrateFallback: AppLoading,
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", ...page(() => import("@/pages/auth/LoginPage"), "LoginPage") },
          { path: "/register", ...page(() => import("@/pages/auth/RegisterPage"), "RegisterPage") },
          { path: "/forgot-password", ...page(() => import("@/pages/auth/PasswordResetPages"), "ForgotPasswordPage") },
        ],
      },
    ],
  },
  {
    // A reset link works whether or not this browser is signed in.
    HydrateFallback: AppLoading,
    element: <AuthLayout />,
    children: [{ path: "/reset-password", ...page(() => import("@/pages/auth/PasswordResetPages"), "ResetPasswordPage") }],
  },
  {
    HydrateFallback: AppLoading,
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, path: "/", element: <DashboardPage /> },
          { path: "/settings", ...page(() => import("@/pages/SettingsPage"), "SettingsPage") },
          { path: "/resumes", ...page(() => import("@/pages/resumes/ResumesPage"), "ResumesPage") },
          { path: "/resumes/upload", ...page(() => import("@/pages/resumes/UploadPage"), "UploadPage") },
          { path: "/resumes/new", ...page(() => import("@/pages/resumes/QuickBuilderPage"), "QuickBuilderPage") },
          { path: "/resumes/imports/:importId", ...page(() => import("@/pages/resumes/ImportReviewPage"), "ImportReviewPage") },
          { path: "/resumes/:resumeId", ...page(() => import("@/pages/resumes/ResumeDetailPage"), "ResumeDetailPage") },
          { path: "/resumes/:resumeId/edit", ...page(() => import("@/pages/resumes/ResumeEditPage"), "ResumeEditPage") },
          { path: "/resumes/:resumeId/versions", ...page(() => import("@/pages/resumes/VersionsPage"), "VersionsPage") },
          { path: "/resumes/:resumeId/analysis", ...page(() => import("@/pages/resumes/AnalysisPage"), "AnalysisPage") },
          { path: "/analysis", ...page(() => import("@/pages/resumes/AnalysisPage"), "AnalysisRedirect") },
          { path: "/jobs", ...page(() => import("@/pages/jobs/JobsPage"), "JobsPage") },
          { path: "/jobs/new", ...page(() => import("@/pages/jobs/JobNewPage"), "JobNewPage") },
          { path: "/jobs/:jobId", ...page(() => import("@/pages/jobs/JobDetailPage"), "JobDetailPage") },
          { path: "/jobs/:jobId/match", ...page(() => import("@/pages/match/MatchPages"), "MatchPage") },
          { path: "/jobs/:jobId/gaps", ...page(() => import("@/pages/match/MatchPages"), "GapPage") },
          { path: "/match", ...page(() => import("@/pages/match/MatchPages"), "MatchIndexPage") },
          { path: "/skill-gaps", ...page(() => import("@/pages/match/MatchPages"), "GapIndexPage") },
          { path: "/tailor", ...page(() => import("@/pages/tailor/TailorIndexPage"), "TailorIndexPage") },
          { path: "/cv-builder", ...page(() => import("@/pages/builder/BuilderPage"), "CvBuilderPage") },
          { path: "/cover-letters", ...page(() => import("@/pages/letters/CoverLetterPages"), "CoverLettersPage") },
          { path: "/cover-letters/:letterId", ...page(() => import("@/pages/letters/CoverLetterPages"), "CoverLetterEditPage") },
          { path: "/builder", ...page(() => import("@/pages/builder/BuilderPage"), "BuilderPage") },
          { path: "/tailor/:sessionId", ...page(() => import("@/pages/tailor/TailorReviewPage"), "TailorReviewPage") },
          { path: "/applications", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationsPage") },
          { path: "/applications/new", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationNewPage") },
          { path: "/applications/:applicationId", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationDetailPage") },
          { path: "/notifications", ...page(() => import("@/pages/applications/NotificationsPage"), "NotificationsPage") },
          { path: "/insights", ...page(() => import("@/pages/insights/CallbackInsightsPage"), "CallbackInsightsPage") },
          { path: "/market", ...page(() => import("@/pages/insights/MarketMapPage"), "MarketMapPage") },
          { path: "/proofs", ...page(() => import("@/pages/insights/ProofBoardPage"), "ProofBoardPage") },
          { path: "/interview", ...page(() => import("@/pages/interview/InterviewPages"), "InterviewIndexPage") },
          { path: "/interview/:prepId", ...page(() => import("@/pages/interview/InterviewPages"), "PrepPage") },
          { path: "/interview/sessions/:sessionId", ...page(() => import("@/pages/interview/InterviewPages"), "PracticePage") },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}

/** For tests: same route table, in-memory history. */
export function createTestRouter(initialPath: string) {
  return createMemoryRouter(routes, { initialEntries: [initialPath] });
}
