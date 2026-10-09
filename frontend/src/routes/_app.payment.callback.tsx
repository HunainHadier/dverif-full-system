import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orgSubscriptionService, type SubscriptionStatusResponse } from "@/services";

export const Route = createFileRoute("/_app/payment/callback")({
  head: () => ({ meta: [{ title: "Payment status — Dverif" }] }),
  component: PaymentCallbackPage,
});

const TERMINAL_STATUSES = ["failed", "cancelled", "expired"] as const;

function PaymentCallbackPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["org-payment-callback-status"],
    queryFn: () => orgSubscriptionService.subscriptionStatus(),
    refetchInterval: (query) => {
      const data = query.state.data as SubscriptionStatusResponse | undefined;
      if (data?.subscription?.status === "active") return false;
      if (
        data?.checkout &&
        TERMINAL_STATUSES.includes(data.checkout.status as (typeof TERMINAL_STATUSES)[number])
      ) {
        return false;
      }
      return 3000;
    },
    retry: false,
  });

  const data = statusQuery.data;
  const subscription = data?.subscription;
  const checkout = data?.checkout ?? null;
  const isActive = subscription?.status === "active";
  const isTerminal =
    !!checkout && TERMINAL_STATUSES.includes(checkout.status as (typeof TERMINAL_STATUSES)[number]);
  const showLoading = !isActive && !isTerminal && !statusQuery.isError;

  // Once the subscription is active, force the app shell's cached
  // "org-subscription" query to refetch so the "not active" banner is
  // cleared immediately when the user navigates back into the app.
  useEffect(() => {
    if (isActive) {
      qc.invalidateQueries({ queryKey: ["org-subscription"] });
    }
  }, [isActive, qc]);

  return (
    <div className="mx-auto max-w-md py-14">
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col items-center justify-center px-8 py-12 text-center">
          {isActive ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("paymentCallback.success")}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("paymentCallback.successDesc")}
              </p>
              <Button className="mt-6" asChild>
                <Link to="/payments">{t("paymentCallback.backToPayments")}</Link>
              </Button>
            </>
          ) : isTerminal ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("paymentCallback.failed")}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("paymentCallback.failedDesc")}
              </p>
              <Button className="mt-6" asChild>
                <Link to="/payments">{t("paymentCallback.tryAgain")}</Link>
              </Button>
            </>
          ) : statusQuery.isError ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("paymentCallback.error")}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("paymentCallback.errorDesc")}
              </p>
              <Button className="mt-6" asChild>
                <Link to="/payments">{t("paymentCallback.backToPayments")}</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("paymentCallback.pending")}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("paymentCallback.pendingDesc")}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {t("paymentCallback.takesLongHint")}
              </p>
              <Button variant="outline" className="mt-6" asChild>
                <Link to="/payments">{t("paymentCallback.backToPayments")}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
