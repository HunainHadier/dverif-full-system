import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  History,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { formatDateTime, resolveAssetUrl } from "@/lib/utils";
import { tDocType } from "@/i18n";
import {
  requestsService,
  type AutoVerifiedHistory,
  type DocumentVerificationRecord,
} from "@/services";

export const Route = createFileRoute("/_app/auto-verified_/$uuid")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/auto-verified")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Verification History — Dverif" }] }),
  component: AutoVerifiedHistoryPage,
});

function OrgAvatar({ logo, name }: { logo?: string | null; name?: string | null }) {
  const src = logo ? (resolveAssetUrl(logo) ?? logo) : null;
  if (!src) return <Building2 className="h-8 w-8 shrink-0 text-primary/70" />;
  return (
    <img
      src={src}
      alt={name ?? "Organization logo"}
      className="h-8 w-8 shrink-0 rounded-md border border-border bg-background object-cover"
    />
  );
}

function methodLabel(method: string | null | undefined) {
  switch (method) {
    case "automatic_match":
      return "autoVerified.methodAuto";
    case "auto":
      return "autoVerified.methodRepeat";
    case "portal":
      return "autoVerified.methodPortal";
    case "admin":
    case "admin_sla":
      return "autoVerified.methodAdmin";
    default:
      return "autoVerified.methodManual";
  }
}

function HistoryPage({
  data,
  isLoading,
}: {
  data?: AutoVerifiedHistory;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const entries: DocumentVerificationRecord[] = data?.history ?? [];
  const total = data?.total_verifications ?? entries.length;
  const docType = data?.document_type ?? "";
  const owner = data?.document_owner_name ?? null;

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t("autoVerified.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("autoVerified.documentType")}</p>
          <p className="truncate text-lg font-semibold text-foreground">{tDocType(docType)}</p>
          {owner ? (
            <p className="truncate text-sm text-muted-foreground">{owner}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("autoVerified.timesVerified")}
          </p>
          <p className="text-2xl font-bold text-success">{total}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("autoVerified.noHistory")}
        </p>
      ) : (
        <ol className="relative space-y-3 pl-6">
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />
          {entries.map((e, idx) => (
            <li key={e.uuid} className="relative">
              <span
                className={
                  idx === 0
                    ? "absolute -left-6 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-success"
                    : "absolute -left-6 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-primary"
                }
              />
              <Card className="border-border/70 shadow-none">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                      <OrgAvatar
                        logo={e.verified_by_organization_logo}
                        name={e.verified_by_organization}
                      />
                      <span className="min-w-0 break-words">
                        {e.verified_by_organization ?? t("autoVerified.unknownOrganization")}
                      </span>
                    </p>
                    {idx === 0 ? (
                      <Badge className="bg-success text-success-foreground hover:bg-success">
                        <BadgeCheck className="mr-1 h-3 w-3" />
                        {t("autoVerified.latestTag")}
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">
                        {t("autoVerified.documentType")}:
                      </dt>
                      <dd className="min-w-0 break-words font-medium text-foreground">
                        {tDocType(e.document_type ?? docType)}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">
                        {t("autoVerified.verifiedOn")}:
                      </dt>
                      <dd className="font-medium text-foreground">
                        {e.verified_at ? formatDateTime(e.verified_at) : "—"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">
                        {t("autoVerified.method")}:
                      </dt>
                      <dd className="font-medium text-foreground">
                        {t(methodLabel(e.verification_method))}
                      </dd>
                    </div>
                    {e.verification_request_uuid ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">
                          {t("autoVerified.requestId")}:
                        </dt>
                        <dd className="font-mono text-xs text-foreground">
                          {e.verification_request_uuid.slice(0, 8)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("autoVerified.ledgerNote")}
      </p>
    </div>
  );
}

function AutoVerifiedHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { uuid } = Route.useParams();

  const q = useQuery({
    queryKey: ["auto-verified-history", uuid],
    queryFn: () => requestsService.autoVerifiedHistory(uuid),
  });

  return (
    <div>
      <PageHeader
        title={t("autoVerified.historyTitle")}
        description={t("autoVerified.historySubtitle", { count: q.data?.total_verifications ?? 0 })}
      />

      <Button
        variant="outline"
        className="mb-4"
        onClick={() => navigate({ to: "/auto-verified" })}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("autoVerified.backToList")}
      </Button>

      <HistoryPage data={q.data} isLoading={q.isLoading} />
    </div>
  );
}
