import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LifeBuoy, Plus } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableSkeleton } from "./_app.requests";
import {
  CategoryBadge,
  PriorityBadge,
  SUPPORT_CATEGORIES,
  SupportStatusTabs,
} from "./_app.org.support";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orgService, orgSupportService, type SupportCategory, type SupportTicket } from "@/services";
import { apiErrorMessage, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/support/")({
  component: OrgSupportPage,
});

const PAGE_SIZE = 10;

type SupportStatus = SupportTicket["status"] | "all";
type SupportPriority = SupportTicket["priority"] | "all";
type SupportCategoryFilter = SupportCategory | "all";

function OrgSupportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportStatus>("all");
  const [priority, setPriority] = useState<SupportPriority>("all");
  const [category, setCategory] = useState<SupportCategoryFilter>("all");
  const [openForm, setOpenForm] = useState(false);

  const list = useQuery({
    queryKey: ["orgSupport", page, search, status, priority, category],
    queryFn: () =>
      orgSupportService.list({
        page,
        limit: PAGE_SIZE,
        search,
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
        category: category === "all" ? undefined : category,
      }),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={t("supportTickets.title")}
        description={t("supportTickets.description")}
        actions={
          <Button onClick={() => setOpenForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t("supportTickets.raiseTicket")}
          </Button>
        }
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <SupportStatusTabs
            value={status}
            onChange={(v) => {
              setStatus(v as SupportStatus);
              setPage(1);
            }}
          />
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t("supportTickets.searchPlaceholder")}
            />
            <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v as SupportCategoryFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("supportTickets.allCategories")}</SelectItem>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`supportTickets.categoryValues.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priority}
                onValueChange={(v) => {
                  setPriority(v as SupportPriority);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("supportTickets.allPriorities")}</SelectItem>
                  <SelectItem value="low">{t("supportTickets.low")}</SelectItem>
                  <SelectItem value="medium">{t("supportTickets.medium")}</SelectItem>
                  <SelectItem value="high">{t("supportTickets.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={LifeBuoy}
                title={t("supportTickets.emptyTitle")}
                description={t("supportTickets.emptyDesc")}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">S.No</TableHead>
                      <TableHead className="whitespace-nowrap">{t("supportTickets.organization")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("supportTickets.raisedBy")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("supportTickets.department")}</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.subject")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.category")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.priorityColumn")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.statusColumn")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.createdAt")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((tk, i) => (
                      <TableRow
                        key={tk.uuid}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({ to: "/org/support/$uuid", params: { uuid: tk.uuid } })
                        }
                      >
                        <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell data-label={t("supportTickets.organization")} className="whitespace-nowrap text-sm">
                          {tk.organization_name ?? "—"}
                        </TableCell>
                        <TableCell data-label={t("supportTickets.raisedBy")} className="whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">{tk.raised_by_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{tk.raised_by_email ?? ""}</div>
                        </TableCell>
                        <TableCell data-label={t("supportTickets.department")} className="whitespace-nowrap text-sm">
                          {tk.raised_by_department ?? "—"}
                        </TableCell>
                        <TableCell data-label="Subject">
                          <button
                            type="button"
                            className="text-left text-sm font-medium text-foreground hover:underline"
                            onClick={() =>
                              navigate({ to: "/org/support/$uuid", params: { uuid: tk.uuid } })
                            }
                          >
                            {tk.subject}
                          </button>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {tk.description}
                          </div>
                        </TableCell>
                        <TableCell data-label="Category" className="whitespace-nowrap">
                          <CategoryBadge category={tk.category} />
                        </TableCell>
                        <TableCell data-label="Priority" className="whitespace-nowrap">
                          <PriorityBadge priority={tk.priority} />
                        </TableCell>
                        <TableCell data-label="Status" className="whitespace-nowrap">
                          <StatusBadge status={tk.status} />
                        </TableCell>
                        <TableCell
                          data-label="Created"
                          className="whitespace-nowrap text-sm text-muted-foreground"
                        >
                          {formatDateTime(tk.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                total={list.data?.total ?? 0}
                totalPages={list.data?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <CreateTicketDialog open={openForm} onOpenChange={setOpenForm} qc={qc} />
    </div>
  );
}

function CreateTicketDialog({
  open,
  onOpenChange,
  qc,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportCategory>("it");
  const [priority, setPriority] = useState<SupportTicket["priority"]>("medium");
  const [departmentUuid, setDepartmentUuid] = useState("auto");
  const departments = useQuery({
    queryKey: ["orgDepartments"],
    queryFn: () => orgService.departments.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setSubject("");
      setDescription("");
      setCategory("it");
      setPriority("medium");
      setDepartmentUuid("auto");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => orgSupportService.create({
      subject,
      description,
      category,
      priority,
      department_uuid: departmentUuid === "auto" ? null : departmentUuid,
    }),
    onSuccess: (data) => {
      toast.success(t("supportTickets.ticketCreated"));
      qc.invalidateQueries({ queryKey: ["orgSupport"] });
      onOpenChange(false);
      navigate({ to: "/org/support/$uuid", params: { uuid: data.ticket.uuid } });
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("common.failed"))),
  });

  const submit = () => {
    if (!subject.trim()) return toast.error(t("supportTickets.subjectRequired"));
    if (!description.trim()) return toast.error(t("supportTickets.descriptionRequired"));
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("supportTickets.raiseTicket")}</DialogTitle>
          <DialogDescription>{t("supportTickets.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tk-subject">{t("supportTickets.subject")}</Label>
            <Input
              id="tk-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("supportTickets.subjectPlaceholder")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("supportTickets.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`supportTickets.categoryValues.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("supportTickets.priorityLabel")}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as SupportTicket["priority"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("supportTickets.low")}</SelectItem>
                  <SelectItem value="medium">{t("supportTickets.medium")}</SelectItem>
                  <SelectItem value="high">{t("supportTickets.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("supportTickets.department")}</Label>
            <Select value={departmentUuid} onValueChange={setDepartmentUuid}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("supportTickets.departmentAuto")}</SelectItem>
                {(departments.data ?? []).map((department) => (
                  <SelectItem key={department.uuid} value={department.uuid}>{department.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tk-desc">{t("supportTickets.descriptionLabel")}</Label>
            <Textarea
              id="tk-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("supportTickets.descriptionPlaceholder")}
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending} loading={create.isPending}>
            {t("supportTickets.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
