import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Lock, RefreshCw, Sparkles, Send, Layers, MessageSquareText, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { useRoles } from "@/lib/permissions";
import {
  marketingService,
  orgSubscriptionService,
  MODULE_FEATURES,
  type SubscriptionPlan,
  type CustomPlanRequest,
  type ModuleFlags,
  type UUID,
} from "@/services";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { classifyPlanForOrg, hasLiveSubscription } from "@/lib/subscription";
import { PlanSelectCard } from "@/components/common/PlanSelectCard";
import { usePlanPicker } from "@/components/common/PlanPickerProvider";
import { formatDate } from "@/lib/utils";

export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { isOrgAdmin, isStaff } = useRoles();
  const { orgSub, isActive, isLocked } = useOrgSubscription();
  const qc = useQueryClient();
  const { open, openPicker, closePicker } = usePlanPicker();
  const [selected, setSelected] = useState<UUID | undefined>(undefined);

  const [quota, setQuota] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const plans = useQuery({
    queryKey: ["plans-banner"],
    queryFn: () => marketingService.listPlans(),
    enabled: open,
  });

  const customRequests = useQuery({
    queryKey: ["org-custom-plan-requests"],
    queryFn: () => orgSubscriptionService.customPlanRequests(),
    enabled: open,
  });

  const requestCustom = useMutation({
    mutationFn: () =>
      orgSubscriptionService.requestCustomPlan({
        message: note.trim(),
        requested_quota: Number(quota),
        requested_price: price.trim() ? Number(price) : null,
      }),
    onSuccess: () => {
      toast.success(t("payments.customPlanSubmitted"));
      setQuota("");
      setPrice("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["org-custom-plan-requests"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("common.failed")),
  });

  const submitCustom = () => {
    const quotaNum = Number(quota);
    if (!quota.trim() || !Number.isInteger(quotaNum) || quotaNum <= 0) {
      toast.error(t("payments.customPlanQuotaRequired"));
      return;
    }
    if (price.trim()) {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        toast.error(t("payments.customPlanPriceInvalid"));
        return;
      }
    }
    requestCustom.mutate();
  };

  const checkoutMut = useMutation({
    mutationFn: (planUuid: UUID) => orgSubscriptionService.checkout(planUuid),
    onSuccess: (data) => {
      if (data?.redirect_url) {
        closePicker();
        window.location.href = data.redirect_url;
      } else {
        toast.error(t("payments.checkoutFailed"));
        setSelected(undefined);
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("common.failed")),
  });

  const isBusy = checkoutMut.isPending || requestCustom.isPending;

  // A renewal keeps the org on the same tier and simply extends the current
  // expiry, and a downgrade is NOT applied immediately either —” the current
  // plan is kept until the paid period ends. Both cases therefore have to be
  // labelled as such instead of implying an immediate switch.
  const hasLiveSub = hasLiveSubscription(orgSub);
  const currentExpiryLabel = orgSub?.expiry ? formatDate(orgSub.expiry) : null;

  // The confirm button must state what will actually happen for the selected
  // plan, so work out whether the current selection is a scheduled downgrade.
  const selectedDowngrade = useMemo(() => {
    if (!hasLiveSub || !selected) return false;
    const target = (plans.data ?? []).find((p) => p.uuid === selected);
    if (!target) return false;
    return classifyPlanForOrg(orgSub, target) === "downgrade";
  }, [hasLiveSub, selected, plans.data, orgSub]);

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
        <Lock className="h-4 w-4 text-destructive" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          {t("subscriptionLocked.notActive")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("subscriptionLocked.contactAdmin")}
        </p>
      </div>
      {isStaff && (
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => openPicker()}>
          {t("subscriptionLocked.viewPlans")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && closePicker()}>
        <DialogContent className="sm:max-h-[92vh] sm:max-w-4xl lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t("subscriptionLocked.viewPlans")}</DialogTitle>
            <DialogDescription>
              {t("subscriptionLocked.selectPlanHint")}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="plans" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="plans">
                <Layers className="mr-1.5 h-4 w-4" /> {t("subscriptionLocked.plansTab")}
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Sparkles className="mr-1.5 h-4 w-4" /> {t("subscriptionLocked.customPlanTab")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plans" className="space-y-4">
              {/* Every plan is listed side by side -- including Free, which is the
                  plan an organization is on by default -- so the tiers can be
                  compared. Three columns keep the cards short enough that the
                  dialog does not need to scroll. */}
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.isLoading && (
                  <div className="col-span-full flex items-center justify-center py-8">
                    <DverifLoader />
                  </div>
                )}
                {plans.isError && (
                  <p className="col-span-full text-sm text-destructive">{t("subscriptionLocked.loadError")}</p>
                )}
                {plans.data && plans.data.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">{t("subscriptionLocked.empty")}</p>
                )}
                {(plans.data ?? []).map((plan: SubscriptionPlan) => {
                  const relation = classifyPlanForOrg(orgSub, plan);
                  const isCurrent = relation === "current";
                  // The Free plan is what an organization is on by default and is
                  // never purchasable, so it must not be selectable here or the
                  // checkout would reject it.
                  const selectable = isOrgAdmin && !isCurrent && plan.is_free !== 1;
                  return (
                    <PlanSelectCard
                      key={plan.uuid}
                      plan={plan}
                      relation={relation}
                      isCurrent={isCurrent}
                      isSelected={plan.uuid === selected}
                      selectable={selectable}
                      busy={isBusy}
                      currentExpiryLabel={currentExpiryLabel}
                      onSelect={setSelected}
                    />
                  );
                })}
              </div>

              {selectedDowngrade && (
                <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t("subscriptionLocked.downgradeNotice", {
                    date: currentExpiryLabel,
                  })}
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => closePicker()} disabled={isBusy}>
                  {t("common.cancel")}
                </Button>
                {isOrgAdmin && (
                  <Button
                    onClick={() => selected && checkoutMut.mutate(selected)}
                    disabled={!selected || checkoutMut.isPending}
                    loading={checkoutMut.isPending}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {selectedDowngrade
                      ? t("subscriptionLocked.scheduleDowngrade")
                      : t("subscriptionLocked.renewNow")}
                  </Button>
                )}
                {!isOrgAdmin && (
                  <Button variant="ghost" onClick={() => closePicker()}>
                    {t("common.close")}
                  </Button>
                )}
              </DialogFooter>
            </TabsContent>

            <TabsContent value="custom" className="space-y-3">
              {isStaff ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("subscriptionLocked.customPlanHint")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("subscriptionLocked.dailyQuota")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={quota}
                        onChange={(e) => setQuota(e.target.value)}
                        placeholder="100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("subscriptionLocked.pricePerMonth")}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="5000"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("subscriptionLocked.optionalNote")}</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("payments.customPlanMessagePlaceholder")}
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={submitCustom} disabled={requestCustom.isPending}>
                      <Send className="mr-1.5 h-4 w-4" />
                      {t("payments.customPlanSubmit")}
                    </Button>
                  </div>

                  {customRequests.data && customRequests.data.length > 0 && (
                    <div className="pt-2">
                      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                        {t("payments.yourCustomPlanRequests")}
                      </h4>
                      <div className="space-y-2">
                        {customRequests.data.map((r: CustomPlanRequest) => (
                          <div
                            key={r.uuid}
                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                {r.requested_quota != null && (
                                  <span className="font-medium text-foreground">
                                    {r.requested_quota} {t("payments.requestsPerDay")}
                                  </span>
                                )}
                                {(r.requested_price ?? r.approved_price) != null && (
                                  <span className="text-muted-foreground">
                                    Rs. {Number(r.requested_price ?? r.approved_price).toLocaleString("en-PK")}
                                  </span>
                                )}
                              </div>
                              {r.message && (
                                <p className="mt-1 truncate text-muted-foreground">{r.message}</p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 rounded-full capitalize ${
                                r.status === "approved"
                                  ? "border-success/30 bg-success/10 text-success"
                                  : r.status === "denied"
                                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                                    : "border-warning/30 bg-warning/10 text-warning-foreground"
                              }`}
                            >
                              {t(
                                `payments.${
                                  r.status === "pending"
                                    ? "customPlanPending"
                                    : r.status === "approved"
                                      ? "customPlanApproved"
                                      : "customPlanDenied"
                                }`
                              )}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/40 p-6 text-center">
                  <MessageSquareText className="h-6 w-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {t("subscriptionLocked.contactAdminHint")}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => closePicker()}>
                    {t("common.close")}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FeatureLockedCard({ title, description }: { title: string; description?: string }) {
  const { isOrgAdmin } = useRoles();
  return (
    <Card className="relative overflow-hidden border-dashed border-destructive/30">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <Lock className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {/* Only an org admin can actually buy a plan, so employees are pointed
            at their admin instead of being shown a checkout they cannot use. */}
        {isOrgAdmin ? (
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link to="/payments">Renew Subscription</Link>
          </Button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Ask your organization admin to upgrade the plan to unlock this.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Shown when the organization IS subscribed but the current plan does not
 * include this module. This is deliberately different from FeatureLockedCard
 * (a dead subscription): here the fix is an upgrade, and the copy says so and
 * offers the plan chooser right here.
 */
export function ModuleFeatureLockedCard({ feature }: { feature: keyof ModuleFlags }) {
  const { t } = useTranslation();
  const { isModuleFlagOff, orgSub } = useOrgSubscription();
  const { openPicker } = usePlanPicker();
  const { isOrgAdmin } = useRoles();
  const label = MODULE_FEATURES.find((m) => m.key === feature)?.label ?? feature;
  if (!isModuleFlagOff(feature)) return null;

  const planName = orgSub?.plan_name || t("payments.free");
  const isFree = orgSub?.is_free === 1;

  return (
    <Card className="relative overflow-hidden border-dashed border-warning/40 bg-warning/5/40">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
            <Lock className="h-5 w-5 text-warning-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("moduleLocked.title", { module: label })}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isFree
                ? t("moduleLocked.freeDesc", { module: label })
                : t("moduleLocked.planDesc", { module: label, plan: planName })}
            </p>
          </div>
        </div>
        {isOrgAdmin ? (
          <Button size="sm" className="mt-4" onClick={() => openPicker(feature)}>
            <Sparkles className="mr-1.5 h-4 w-4" /> {t("moduleLocked.upgradeCta")}
          </Button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">{t("moduleLocked.askAdmin")}</p>
        )}
      </CardContent>
    </Card>
  );
}
