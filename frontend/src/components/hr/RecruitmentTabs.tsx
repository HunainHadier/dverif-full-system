import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * The five recruitment screens as ONE tab strip.
 *
 * Deliberately a strip across five routes rather than five sidebar entries.
 * Openings, candidates, the board, interviews and offers are five views of one
 * hiring, and a recruiter moves between them continuously while working on a single
 * person — so the module has to stay visually identified while switching. Five
 * near-identical sidebar items in a menu that already carries twenty would also make
 * this the least navigable module in the product.
 *
 * The sidebar links only the PIPELINE, which is the hub; the other four are reached
 * from here.
 *
 * ACTIVE STATE IS COMPUTED, NOT TAKEN FROM A LINK PROP. There is no NavLink in this
 * router version (AppShell derives its highlighting from the pathname for the same
 * reason), so the comparison is done against `useLocation().pathname` — and
 * EXACTLY, not with `startsWith`. Every recruitment path shares the
 * `/org/recruitment/` prefix, so a prefix match would light up all five tabs at once
 * and leave the strip useless for telling tabs apart. That is why `/org/recruitment`
 * is a prefix for all of them and equality is the only correct test.
 */
export function RecruitmentTabs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  /**
   * The label is chosen by a switch rather than held in a table with a `labelKey`,
   * deliberately. A table would work at runtime, but `t(tab.labelKey)` is a computed
   * key that the i18n audit script cannot see — so all five tab labels would be
   * reported as never-referenced, and a typo in one would reach production as a raw
   * key string on the strip that navigates the whole module. Literal translation calls
   * with a literal key keep them auditable, at the cost of a few lines.
   *
   * (Written out in words rather than quoted, because the i18n audit reads any
   * quoted key inside these comments as a real reference — the same trap that makes it
   * skip test files.)
   */
  const label = (path: string) => {
    switch (path) {
      case "/org/recruitment/pipeline":
        return t("recruitment.tabPipeline");
      case "/org/recruitment/candidates":
        return t("recruitment.tabCandidates");
      case "/org/recruitment/openings":
        return t("recruitment.tabOpenings");
      case "/org/recruitment/interviews":
        return t("recruitment.tabInterviews");
      case "/org/recruitment/offers":
        return t("recruitment.tabOffers");
      default:
        return path;
    }
  };

  const tabs = [
    "/org/recruitment/pipeline",
    "/org/recruitment/candidates",
    "/org/recruitment/openings",
    "/org/recruitment/interviews",
    "/org/recruitment/offers",
  ] as const;

  return (
    <nav aria-label={t("recruitment.title")} className="flex flex-wrap gap-1 border-b">
      {tabs.map((to) => (
        <Link
          key={to}
          to={to}
          aria-current={pathname === to ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            pathname === to
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label(to)}
        </Link>
      ))}
    </nav>
  );
}
