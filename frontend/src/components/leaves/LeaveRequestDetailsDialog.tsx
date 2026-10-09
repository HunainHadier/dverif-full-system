import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LeaveRequest } from "@/services";
import { countDays, formatDate, formatDateTime } from "@/lib/utils";
import { FormattedLeaveReason } from "@/components/leaves/FormattedLeaveReason";

export function LeaveRequestDetailsDialog({
  request,
  onOpenChange,
}: {
  request: LeaveRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("leaves.requestDetails", "Leave request details")}</DialogTitle>
          <DialogDescription>
            {t("leaves.requestDetailsDescription", "Full details for this leave request.")}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {request.employee_name ? (
              <Detail label={t("orgLeaves.employee", "Employee")} value={request.employee_name} />
            ) : null}
            {request.employee_email ? (
              <Detail label={t("common.email", "Email")} value={request.employee_email} />
            ) : null}
            <Detail label={t("leaves.leaveType", "Leave type")} value={request.leave_type_name} />
            <Detail
              label={t("leaves.dates", "Dates")}
              value={`${formatDate(request.start_date)} \u2192 ${formatDate(request.end_date)}`}
            />
            <Detail
              label={t("leaves.days", "Days")}
              value={String(countDays(request.start_date, request.end_date))}
            />
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">{t("leaves.status", "Status")}</dt>
              <dd><StatusBadge status={request.status} /></dd>
            </div>
            <Detail
              label={t("leaves.submitted", "Submitted")}
              value={formatDateTime(request.created_at)}
            />
            {request.approved_at ? (
              <Detail
                label={t("leaves.reviewedAt", "Reviewed at")}
                value={formatDateTime(request.approved_at)}
              />
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t("leaves.reason", "Reason")}</dt>
              <dd className="break-words text-sm leading-6 text-foreground">
                {request.reason?.trim() ? (
                  <FormattedLeaveReason text={request.reason} />
                ) : (
                  t("leaves.noReasonProvided", "No reason provided.")
                )}
              </dd>
            </div>
          </dl>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
