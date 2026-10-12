import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AnalysisPage, AnalysisRedirect } from "@/pages/resumes/AnalysisPage";
import { ImportReviewPage } from "@/pages/resumes/ImportReviewPage";
import { ResumeDetailPage } from "@/pages/resumes/ResumeDetailPage";
import { NewResumePage, ResumeEditPage } from "@/pages/resumes/ResumeEditPage";
import { ResumesPage } from "@/pages/resumes/ResumesPage";
import { UploadPage } from "@/pages/resumes/UploadPage";
import { VersionsPage } from "@/pages/resumes/VersionsPage";
import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";

export const routes: RouteObject[] = [
  {
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
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, path: "/", element: <DashboardPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/resumes", element: <ResumesPage /> },
          { path: "/resumes/upload", element: <UploadPage /> },
          { path: "/resumes/new", element: <NewResumePage /> },
          { path: "/resumes/imports/:importId", element: <ImportReviewPage /> },
          { path: "/resumes/:resumeId", element: <ResumeDetailPage /> },
          { path: "/resumes/:resumeId/edit", element: <ResumeEditPage /> },
          { path: "/resumes/:resumeId/versions", element: <VersionsPage /> },
          { path: "/resumes/:resumeId/analysis", element: <AnalysisPage /> },
          { path: "/analysis", element: <AnalysisRedirect /> },
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
