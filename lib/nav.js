// Shared nav link definitions — used by the desktop/drawer Sidebar and the
// mobile BottomNav so they stay in sync.
// Lucide, not Feather. Feather's hairline 1.5px strokes read thin and
// washed out at nav size; Lucide is the same visual family with a slightly
// heavier, more confident stroke — and it's the set used in the dashboard
// reference this UI is being matched to.
import {
  LuLayoutDashboard,
  LuBriefcase,
  LuUsers,
  LuChartColumn,
  LuCircleHelp,
  LuSettings,
  LuColumns3,
  LuTarget,
  LuZap,
  LuSend,
  LuHouse,
  LuSquareCheckBig,
  LuHardHat,
} from "react-icons/lu";

// `perm` = permission required to see the link (null = everyone signed in).
// `hideRoles` = roles that never see this link, even though `perm` allows it
// (used for the stripped-down Engineer portal account).
// Sidebar = daily ops. Top utility bar = admin/config only.
export const navLinks = [
  { href: "/", label: "Dashboard", icon: LuLayoutDashboard, perm: "dashboard" },
  { href: "/portal", label: "My Jobs", icon: LuHardHat, perm: "portal" },
  { href: "/dispatch", label: "Dispatch", icon: LuColumns3, perm: null, hideRoles: ["engineer"] },
  { href: "/jobs", label: "Jobs", icon: LuBriefcase, perm: null, hideRoles: ["engineer"] },
  { href: "/prospects", label: "Prospects", icon: LuTarget, perm: "prospects" },
  { href: "/agents", label: "Agents", icon: LuHouse, perm: "agents" },
  { href: "/leads", label: "Leads", icon: LuZap, perm: "prospects" },
  { href: "/campaigns", label: "Campaigns", icon: LuSend, perm: "prospects" },
  // A user granted only "expenses" (not full "reports") still needs to see
  // this link to reach the Reports page at all — the page itself then
  // restricts them to just the Expenses tab.
  { href: "/reports", label: "Reports", icon: LuChartColumn, perm: null, anyPerm: ["reports", "expenses"] },
  { href: "/team", label: "Team", icon: LuSquareCheckBig, perm: "team" },
];

// Secondary items in the desktop top utility bar + mobile drawer.
export const utilityLinks = [
  { href: "/clients", label: "Clients", icon: LuUsers, perm: "clients" },
  { href: "/engineers", label: "Engineers", icon: LuHardHat, perm: "engineers" },
  { href: "/settings", label: "Settings", icon: LuSettings, perm: "settings" },
  { href: "/help", label: "Help & Docs", icon: LuCircleHelp, perm: null },
];

// Returns the nav links visible to the current user (role-aware).
export function visibleNavLinks(can, role) {
  return navLinks.filter((link) => {
    if (link.perm && !can(link.perm)) return false;
    if (link.anyPerm && !link.anyPerm.some((p) => can(p))) return false;
    if (!link.perm && !link.anyPerm && role === "engineer" && link.hideRoles?.includes("engineer")) return false;
    if (link.hideRoles?.includes(role)) return false;
    return true;
  });
}

export function visibleUtilityLinks(can, role) {
  if (role === "engineer") return [];
  return utilityLinks.filter((link) => !link.perm || can(link.perm));
}

// Primary tabs shown in the mobile bottom nav (max 5, no "More" — the
// hamburger in the top bar already opens the full drawer, so every slot is
// a real destination). Prospects earns a slot: it's the daily outreach hub.
// Engineers get a minimal portal-only bar. Admins (who can see
// Reports/finance) get Reports as a primary tab — that's the thing most
// worth checking on the go. Agents get Dispatch instead since they don't
// have reports access.
export function PRIMARY_HREFS(can, role) {
  if (role === "engineer") {
    return ["/portal", "/help"];
  }
  if (can("reports")) {
    // THREE tabs, not five. Five 20%-wide cells turned the bar into a row of
    // blocks with cramped labels, and Prospects/Clients are destinations you
    // go to deliberately — they don't need a permanent slot when the
    // hamburger opens the full menu one tap away. Dashboard / Jobs / Reports
    // is what you actually bounce between on a phone.
    return ["/", "/jobs", "/reports"];
  }
  const tabs = ["/dispatch", "/jobs"];
  if (can("prospects")) tabs.push("/prospects");
  // Expenses-only (no full "reports") still needs Reports reachable on
  // mobile — that's the whole point of the permission.
  if (can("expenses")) tabs.push("/reports");
  return tabs;
}
