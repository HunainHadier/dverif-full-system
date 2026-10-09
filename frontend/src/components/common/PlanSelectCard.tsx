import { useTranslation } from "react-i18next";
import { Check, Layers, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlanFeatureList } from "@/components/common/PlanFeatureList";
import type { PlanTierRelation } from "@/lib/subscription";
import type { SubscriptionPlan } from "@/services";

/**
 * One selectable plan card inside the "View Plan" dialog.
 *
 * All plans are shown side by side -- including the Free plan, which is what an
 * organization is on by default -- so the tiers can actually be compared. Only
 * the derived state is passed in; the tier logic stays in lib/subscription.ts.
 */
export function PlanSelectCard({
  plan,
  relation,
  isCurrent,
  isSelected,
  selectable,
  busy,
  currentExpiryLabel,
  onSelect,
}: {
  plan: SubscriptionPlan;
  /** How this plan ranks against the organization's current one. */
  relation: PlanTierRelation;
  isCurrent: boolean;
  isSelected: boolean;
  /** False for non-admins, for the current plan, and for Free (never purchasable). */
  selectable: boolean;
  busy: boolean;
  /** Formatted current expiry, used in the deferred-downgrade label. */
  currentExpiryLabel: string | null;
  onSelect: (planUuid: string) => void;
}) {
  const { t } = useTranslation();
  const isFree = plan.is_free === 1;
  const isRecommended = plan.is_recommended === 1;
  const isDowngrade = relation === "downgrade";

  return (
    <Card
      role="button"
      tabIndex={selectable && !busy ? 0 : -1}
      aria-pressed={isSelected}
      onClick={() => {
        if (!selectable || busy) return;
        onSelect(plan.uuid);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (!selectable || busy) return;
        onSelect(plan.uuid);
      }}
      className={`flex flex-col rounded-xl bg-card text-left shadow-none transition hover:shadow-md ${
        isCurrent
          ? "border-primary/60 ring-1 ring-primary/40"
          : isSelected
            ? "border-primary bg-primary/5"
            : "border-border/70 hover:border-primary/40"
      } ${selectable ? "cursor-pointer" : "cursor-default"}`}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isCurrent ? (
              <Badge variant="secondary" className="rounded-full text-[11px] font-medium">
                <Check className="mr-1 h-3 w-3" />
                {t("subscriptionLocked.currentPlan")}
              </Badge>
            ) : null}
            {isRecommended ? (
              <Badge className="rounded-full bg-primary text-[11px] text-primary-foreground hover:bg-primary">
                <Sparkles className="mr-1 h-3 w-3" />
                {t("subscriptionLocked.recommended")}
              </Badge>
            ) : null}
            {isFree ? (
              <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                {t("subscriptionLocked.freeBadge")}
              </Badge>
            ) : null}
            {isSelected && !isCurrent ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
          </div>
        </div>

        <div>
          <div className="text-base font-semibold capitalize text-foreground">{plan.name}</div>
          {plan.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>
          ) : null}
        </div>

        <div className="flex items-baseline gap-1">
          {isFree ? (
            <span className="text-2xl font-bold text-foreground">{t("payments.free")}</span>
          ) : (
            <>
              <span className="text-2xl font-bold text-foreground">
                Rs. {plan.monthly_price?.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">/ {plan.billing_period}</span>
            </>
          )}
        </div>

        {isCurrent ? (
          <Button variant="outline" className="w-full" disabled>
            <Check className="mr-1.5 h-4 w-4" /> {t("subscriptionLocked.currentPlan")}
          </Button>
        ) : isFree ? (
          <Button variant="outline" className="w-full" disabled>
            {t("subscriptionLocked.freePlanDefault")}
          </Button>
        ) : isDowngrade ? (
          <Button
            className="w-full"
            onClick={() => onSelect(plan.uuid)}
            disabled={!selectable || busy}
          >
            {t("subscriptionLocked.downgradeAtPeriodEnd", { date: currentExpiryLabel })}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => onSelect(plan.uuid)}
            disabled={!selectable || busy}
          >
            {t("subscriptionLocked.selectPlan")}
          </Button>
        )}

        <div className="border-t border-border pt-3">
          {plan.features && plan.features.length > 0 ? (
            <PlanFeatureList plan={plan} features={plan.features} size="xs" />
          ) : (
            <p className="text-xs text-muted-foreground">{t("payments.noFeaturesDesc")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
