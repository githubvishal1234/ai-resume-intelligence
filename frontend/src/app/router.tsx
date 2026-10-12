import type { ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PageLoading } from "@/components/ui/States";
import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";

/**
 * Route-level code splitting: each screen loads on first visit. The shell, sign-in pages,
 * dashboard and not-found page stay in the main bundle so the first paint needs one request.
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
  {
    HydrateFallback: AppLoading,
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
        ],
      },
    ],
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
          { path: "/resumes/new", ...page(() => import("@/pages/resumes/ResumeEditPage"), "NewResumePage") },
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
          { path: "/builder", ...page(() => import("@/pages/builder/BuilderPage"), "BuilderPage") },
          { path: "/tailor/:sessionId", ...page(() => import("@/pages/tailor/TailorReviewPage"), "TailorReviewPage") },
          { path: "/applications", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationsPage") },
          { path: "/applications/new", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationNewPage") },
          { path: "/applications/:applicationId", ...page(() => import("@/pages/applications/ApplicationPages"), "ApplicationDetailPage") },
          { path: "/notifications", ...page(() => import("@/pages/applications/NotificationsPage"), "NotificationsPage") },
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
