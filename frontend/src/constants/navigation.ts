import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  FileSignature,
  FileText,
  GitCompareArrows,
  GraduationCap,
  Hammer,
  IdCard,
  LayoutDashboard,
  Map as MapIcon,
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
      { id: "job-match", label: "Job Match", icon: GitCompareArrows, to: "/match", phase: 4, phaseNote: "Matching" },
      { id: "skill-gap", label: "Skill Gap Matrix", icon: Network, to: "/skill-gaps", phase: 4, phaseNote: "Matching" },
      { id: "market", label: "Market Map", icon: MapIcon, to: "/market", phase: 21, phaseNote: "Career intelligence" },
    ],
  },
  {
    id: "automation",
    label: "AI Automation",
    items: [
      { id: "tailor", label: "Tailor Resume", shortLabel: "Tailor", icon: Sparkles, to: "/tailor", phase: 5, phaseNote: "Tailoring" },
      { id: "interview", label: "Interview Prep", icon: MessagesSquare, to: "/interview", phase: 8, phaseNote: "Interview" },
      { id: "stories", label: "Story Bank", icon: BookOpen, to: "/stories", phase: 23, phaseNote: "Interview" },
    ],
  },
  {
    id: "builders",
    label: "Builders",
    items: [
      { id: "builder", label: "Resume Builder", icon: PenLine, to: "/builder", phase: 6, phaseNote: "Resume Output" },
      { id: "cv-builder", label: "CV Builder", icon: GraduationCap, to: "/cv-builder", phase: 22, phaseNote: "Builders" },
      { id: "cover-letters", label: "Cover Letters", icon: FileSignature, to: "/cover-letters", phase: 22, phaseNote: "Builders" },
      { id: "profile-builder", label: "Profile Builder", icon: IdCard, to: "/profile-builder", phase: 23, phaseNote: "Builders" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      { id: "applications", label: "Applications", icon: BriefcaseBusiness, to: "/applications", phase: 7, phaseNote: "Applications" },
      { id: "insights", label: "Callback Insights", icon: BarChart3, to: "/insights", phase: 21, phaseNote: "Career intelligence" },
      { id: "proofs", label: "Proof Board", icon: Hammer, to: "/proofs", phase: 21, phaseNote: "Career intelligence" },
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
