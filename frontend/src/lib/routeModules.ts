import type { ModuleFlags } from "@/services";

/**
 * Which subscription module each sidebar page belongs to.
 *
 * The sidebar reads this to badge the exact links the current plan excludes, so
 * a locked module is offered as "upgrade to unlock" in the menu instead of
 * navigating to a page that can only render its locked card.
 *
 * It lives here rather than in AppShell for the same reason ROUTE_ACCESS does:
 * the mapping is data, and `lib/routeModules.test.ts` can then check it against
 * the pages that actually carry a ModuleGate. A map that only covers some of the
 * modules produces exactly the inconsistency it exists to prevent -- some
 * modules badge in the sidebar, others open a dead-end page.
 *
 * Only navigable paths belong here. Sub-routes inherit their page's gate through
 * that page's own ModuleGate/ModuleFeatureLockedCard, and the sidebar never
 * renders them as separate links.
 */
export const ROUTE_MODULES: Readonly<Record<string, keyof ModuleFlags>> = {
  // --- Core HR --------------------------------------------------------------
  "/org/team": "employee_management",
  "/org/admins": "user_management",
  "/org/leaves": "leave_management",
  "/org/attendance": "attendance_management",
  "/org/salary-components": "payroll_management",
  "/org/payroll": "payroll_management",
  "/leaves": "leave_management",
  "/attendance": "attendance_management",
  "/payroll": "payroll_management",

  // --- Documents ------------------------------------------------------------
  "/org/letter-templates": "hr_letters_management",
  "/org/hr-letters": "hr_letters_management",
  "/my-letters": "hr_letters_management",

  // --- Money ops ------------------------------------------------------------
  "/org/expense-claims": "expense_management",
  "/my-expenses": "expense_management",

  // --- Assets ---------------------------------------------------------------
  "/org/asset-categories": "asset_management",
  "/org/assets": "asset_management",
  "/my-assets": "asset_management",

  // --- Workforce lifecycle --------------------------------------------------
  "/org/offboarding": "separation_management",
  "/my-resignation": "separation_management",
  "/org/recruitment/pipeline": "recruitment_management",
};
