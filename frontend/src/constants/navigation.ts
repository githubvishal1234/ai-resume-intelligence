import {
  BriefcaseBusiness,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  MessagesSquare,
  Network,
  PenLine,
  ScanSearch,
  Settings,
  Sparkles,
  Telescope,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  /** Shorter label for the mobile tab bar. Falls back to `label`. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Route path when the screen exists; undefined while the feature is not built yet. */
  to?: string;
  /** Phase in which this screen is delivered (docs/PRODUCTION_IMPLEMENTATION_PLAN.md). */
  phase: number;
  phaseNote: string;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/", phase: 1, phaseNote: "" },
      { id: "resumes", label: "My Resumes", shortLabel: "Resumes", icon: FileText, to: "/resumes", phase: 2, phaseNote: "Master Resume" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { id: "analysis", label: "Resume Analysis", icon: ScanSearch, to: "/analysis", phase: 2, phaseNote: "Master Resume" },
      { id: "job-analyzer", label: "Job Analyzer", icon: Telescope, to: "/jobs", phase: 3, phaseNote: "Job Intelligence" },
      { id: "job-match", label: "Job Match", icon: GitCompareArrows, phase: 4, phaseNote: "Matching" },
      { id: "skill-gap", label: "Skill Gap Matrix", icon: Network, phase: 4, phaseNote: "Matching" },
    ],
  },
  {
    id: "automation",
    label: "AI Automation",
    items: [
      { id: "tailor", label: "Tailor Resume", shortLabel: "Tailor", icon: Sparkles, phase: 5, phaseNote: "AI Tailoring" },
      { id: "builder", label: "Resume Builder", icon: PenLine, phase: 6, phaseNote: "Resume Output" },
      { id: "interview", label: "Interview Prep", icon: MessagesSquare, phase: 8, phaseNote: "Interview" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      { id: "applications", label: "Applications", icon: BriefcaseBusiness, phase: 7, phaseNote: "Applications" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ id: "settings", label: "Settings", icon: Settings, to: "/settings", phase: 1, phaseNote: "" }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Bottom tab bar on small screens (Stitch mobile): five primary destinations. */
export const MOBILE_TAB_IDS = ["dashboard", "resumes", "tailor", "applications", "settings"] as const;

export function navDisabledReason(item: NavItem): string {
  return `Not available yet — planned for Phase ${item.phase} (${item.phaseNote}).`;
}
