import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PriorityBadge } from "./_app.org.support";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import { adminSupportService, type SupportReply, type SupportTicket } from "@/services";

export const Route = createFileRoute("/_app/admin/support/$uuid")({
  head: () => ({ meta: [{ title: "Support Ticket —” Dverif Admin" }] }),
  component: AdminSupportDetailPage,
});

function AdminSupportDetailPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { uuid } = useParams({ from: "/_app/admin/support/$uuid" });
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"] | "">("");

  const detail = useQuery({
    queryKey: ["adminSupport", uuid],
    queryFn: () => adminSupportService.get(uuid),
  });

  const reply = useMutation({
    mutationFn: (msg: string) => adminSupportService.addReply(uuid, msg),
    onSuccess: () => {
      toast.success(t("supportTickets.replySent"));
      setMessage("");
      qc.invalidateQueries({ queryKey: ["adminSupport", uuid] });
      qc.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("common.failed")),
  });

  const setStatusMut = useMutation({
    mutationFn: (s: SupportTicket["status"]) => adminSupportService.updateStatus(uuid, s),
    onSuccess: () => {
      toast.success(t("supportTickets.statusUpdated"));
      setStatus("");
      qc.invalidateQueries({ queryKey: ["adminSupport", uuid] });
      qc.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("common.failed")),
  });

  if (detail.isLoading) {
    return <div className="h-40 animate-pulse rounded-md bg-muted" />;
  }

  if (!detail.data) {
    return <p className="text-sm text-muted-foreground">{t("common.failed")}</p>;
  }

  const { ticket, replies } = detail.data;
  const isClosed = ticket.status === "closed";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/admin/support"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("supportTickets.backToList")}
      </Link>

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground sm:text-xl">{ticket.subject}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <span>{ticket.organization_name ?? "—”"}</span>
                <span>
                  {t("supportTickets.raisedBy")}: {ticket.raised_by_name ?? ticket.raised_by_email ?? "—”"}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {ticket.description}
          </p>

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            <Label className="text-sm text-muted-foreground">
              {t("supportTickets.statusColumn")}
            </Label>
            <Select
              value={status || undefined}
              onValueChange={(v) => {
                const s = v as SupportTicket["status"];
                setStatus(s);
                setStatusMut.mutate(s);
              }}
            >
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("status.open")}</SelectItem>
                <SelectItem value="in_progress">{t("status.in_progress")}</SelectItem>
                <SelectItem value="resolved">{t("status.resolved")}</SelectItem>
                <SelectItem value="closed">{t("status.closed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border/70 shadow-none">
        <CardContent className="p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("supportTickets.repliesTitle")}
          </h2>

          {replies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("supportTickets.noReplies")}</p>
          ) : (
            <div className="space-y-4">
              {replies.map((r: SupportReply) => (
                <AdminReplyBubble key={r.uuid} reply={r} currentEmail={user?.email} />
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-border pt-4">
            {isClosed ? (
              <p className="text-sm text-muted-foreground">{t("supportTickets.closedNoReply")}</p>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("supportTickets.replyPlaceholder")}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      if (!message.trim()) return toast.error(t("supportTickets.replyRequired"));
                      reply.mutate(message.trim());
                    }}
                    disabled={reply.isPending}
                    loading={reply.isPending}
                  >
                    <Send className="mr-2 h-4 w-4" /> {t("supportTickets.sendReply")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminReplyBubble({ reply, currentEmail }: { reply: SupportReply; currentEmail?: string }) {
  const { t } = useTranslation();
  const isOrgUser = reply.replied_by_type === "org_user";
  const isCurrentUser = !isOrgUser && !!currentEmail && reply.replied_by_email === currentEmail;

  const name = isOrgUser
    ? reply.replied_by_name ?? reply.replied_by_email ?? t("supportTickets.you")
    : isCurrentUser
      ? t("supportTickets.you")
      : reply.replied_by_name ?? t("supportTickets.supportTeam");
  const initials = (name || "?").slice(0, 1).toUpperCase();

  return (
    <div className={cn("flex gap-3", isOrgUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          isOrgUser ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {initials}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl border border-border px-4 py-2.5",
          isOrgUser ? "rounded-tr-sm" : "rounded-tl-sm",
        )}
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <span className="text-[10px] text-muted-foreground">{formatDateTime(reply.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{reply.message}</p>
      </div>
    </div>
  );
}
