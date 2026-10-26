import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type SupportCategory, type SupportTicket } from "@/services";

export const Route = createFileRoute("/_app/org/support")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/support")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Support — Dverif" }] }),
  component: () => <Outlet />,
});

export const SUPPORT_CATEGORIES: readonly SupportCategory[] = ["it", "hr", "admin", "payroll"];

export function PriorityBadge({ priority }: { priority: SupportTicket["priority"] }) {
  const { t } = useTranslation();
  const color =
    priority === "high"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : priority === "medium"
        ? "border-warning/30 bg-warning/10 text-warning-foreground"
        : "border-success/30 bg-success/10 text-success";
  return (
    <Badge variant="outline" className={`rounded-full capitalize ${color}`}>
      {t(`supportTickets.${priority}`)}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category?: SupportCategory | null }) {
  const { t } = useTranslation();
  if (!category) return null;
  return (
    <Badge variant="outline" className="rounded-full capitalize">
      {t(`supportTickets.categoryValues.${category}`)}
    </Badge>
  );
}

export function AssignmentBadge({ role }: { role?: SupportTicket["assigned_to_role"] }) {
  const { t } = useTranslation();
  const target = role ?? "org_admin";
  return (
    <Badge variant="secondary" className="rounded-full">
      {target === "system_admin" ? t("supportTickets.systemAdmin") : t("supportTickets.orgAdmin")}
    </Badge>
  );
}

const STATUS_TABS = [
  { value: "all", labelKey: "supportTickets.allTickets" },
  { value: "open", labelKey: "supportTickets.newOpen" },
  { value: "in_progress", labelKey: "status.in_progress" },
  { value: "resolved", labelKey: "status.resolved" },
  { value: "closed", labelKey: "status.closed" },
] as const;

export function SupportStatusTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("supportTickets.statusColumn")}
      className="flex flex-wrap gap-1 border-b border-border px-2 pt-2"
    >
      {STATUS_TABS.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
