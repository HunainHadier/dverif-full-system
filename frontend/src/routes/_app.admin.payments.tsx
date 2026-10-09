import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Wallet, Sparkles, Check, X, Layers, Pencil, Trash2, Power, ArrowUpRight, Clock, Star } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
import { TableSkeleton } from "./_app.requests";
import {
  adminService,
  MODULE_FEATURES,
  ALL_MODULE_FLAGS_ON,
  type ModuleFlags,
  type CustomPlanRequest,
  type SubscriptionPlan,
  type SubscriptionCheckout,
  type PlanFeature,
} from "@/services";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/payments")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Payments — Dverif Admin" }] }),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const search = useSearch({ from: "/_app/admin/payments" });
  const sidebarCounts = useQuery({
    queryKey: ["admin-sidebar-counts"],
    queryFn: () => adminService.sidebarCounts(),
    refetchInterval: 30_000,
    retry: false,
  });
  const initialTab = search.tab && ["history", "self-subscriptions", "custom-plans", "custom-plan-catalog", "plans"].includes(search.tab)
    ? search.tab
    : "history";

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Review platform payments, record manual receipts, and track organization subscriptions."
      />

      <Tabs defaultValue={initialTab}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:w-auto sm:grid-cols-none">
          <TabsTrigger value="history" className="min-w-0 whitespace-normal px-1.5 text-center text-[11px] leading-tight sm:whitespace-nowrap sm:px-3 sm:text-sm">
            <Wallet className="mr-1.5 h-4 w-4 shrink-0" /> Payment History
          </TabsTrigger>
          <TabsTrigger value="self-subscriptions" className="min-w-0 whitespace-normal px-1.5 text-center text-[11px] leading-tight sm:whitespace-nowrap sm:px-3 sm:text-sm">
            <Clock className="mr-1.5 h-4 w-4 shrink-0" /> Self-subscriptions
          </TabsTrigger>
          <TabsTrigger value="custom-plans" className="min-w-0 whitespace-normal px-1.5 text-center text-[11px] leading-tight sm:whitespace-nowrap sm:px-3 sm:text-sm">
            <Sparkles className="mr-1.5 h-4 w-4 shrink-0" /> Custom Plan Requests
            {(sidebarCounts.data?.custom_plan_requests ?? 0) > 0 ? (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 shrink-0 px-1 text-[10px]">
                {sidebarCounts.data!.custom_plan_requests}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="custom-plan-catalog" className="min-w-0 whitespace-normal px-1.5 text-center text-[11px] leading-tight sm:whitespace-nowrap sm:px-3 sm:text-sm">
            <Sparkles className="mr-1.5 h-4 w-4 shrink-0" /> Custom Plans
          </TabsTrigger>
          <TabsTrigger value="plans" className="min-w-0 whitespace-normal px-1.5 text-center text-[11px] leading-tight sm:whitespace-nowrap sm:px-3 sm:text-sm">
            <Layers className="mr-1.5 h-4 w-4 shrink-0" /> Plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <PaymentHistoryTab />
        </TabsContent>

        <TabsContent value="self-subscriptions">
          <SelfSubscriptionTab />
        </TabsContent>

        <TabsContent value="custom-plans">
          <CustomPlanRequestsTab />
        </TabsContent>

        <TabsContent value="custom-plan-catalog">
          <CustomPlansTab />
        </TabsContent>

        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────── Payment History Tab ─────────── */
function PaymentHistoryTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openForm, setOpenForm] = useState(false);

  const list = useQuery({
    queryKey: ["admin-payments", page, search, method, dateFrom, dateTo],
    queryFn: () =>
      adminService.payments({
        page,
        limit: 10,
        search,
        method: method === "all" ? undefined : method,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search reference or user…"
          />
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full lg:w-40"
            />
            <span className="text-xs text-muted-foreground max-lg:px-1">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full lg:w-40"
            />
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="jazzcash">JazzCash</SelectItem>
                <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full lg:w-auto" onClick={() => setOpenForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add manual payment
            </Button>
          </div>
        </div>
        {list.isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Wallet} title="No payments yet" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">S.No</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p, i) => (
                  <TableRow key={p.uuid}>
                    <TableCell data-label="S.No" className="w-10 text-muted-foreground">{(page - 1) * 10 + i + 1}</TableCell>
                    <TableCell data-label="Reference" className="font-mono text-xs">{p.transaction_reference}</TableCell>
                    <TableCell data-label="User" className="text-muted-foreground">
                      {p.full_name ?? "—"}
                      <div className="text-xs">{p.email}</div>
                    </TableCell>
                    <TableCell data-label="Method">
                      <Badge variant="outline" className="rounded-full capitalize">
                        {p.payment_method}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Purpose" className="text-muted-foreground">{p.purpose}</TableCell>
                    <TableCell data-label="Date" className="text-xs text-muted-foreground">
                      {formatDate(p.paid_at ?? p.created_at)}
                    </TableCell>
                    <TableCell data-label="Amount" className="text-right font-medium">Rs. {p.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={list.data?.total ?? 0}
              totalPages={list.data?.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}
      </CardContent>

      <PaymentFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        onDone={() => {
          setOpenForm(false);
          qc.invalidateQueries({ queryKey: ["admin-payments"] });
        }}
      />
    </Card>
  );
}

/* ─────────── Add Manual Payment Dialog ─────────── */
function PaymentFormDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const users = useQuery({
    queryKey: ["admin-users-lookup"],
    queryFn: () => adminService.users({ page: 1, limit: 100 }),
    enabled: open,
  });

  // Only organizations that already have users (assigned) show up here; each
  // org keeps the UUID of its first user for the payment record.
  const orgs = Array.from(
    (users.data?.items ?? []).reduce((map, u) => {
      if (u.organization_uuid && u.organization_name && !map.has(u.organization_uuid)) {
        map.set(u.organization_uuid, { name: u.organization_name, userUuid: u.uuid });
      }
      return map;
    }, new Map<string, { name: string; userUuid: string }>()).entries(),
    ([uuid, o]) => ({ uuid, ...o })
  );

  const [org, setOrg] = useState<{ uuid: string; name: string; userUuid: string } | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<"jazzcash" | "easypaisa" | "manual">("manual");
  const [ref, setRef] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!org || !amount || !ref || !purpose)
      return toast.error("All fields are required");
    setSubmitting(true);
    try {
      await adminService.createPayment({
        user_uuid: org.userUuid,
        amount: Number(amount),
        payment_method: method,
        transaction_reference: ref,
        purpose,
      });
      toast.success("Payment recorded");
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add manual payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Organization</Label>
            <SearchableSelect
              items={orgs.map((o) => ({ value: o.uuid, label: o.name }))}
              value={org?.uuid ?? ""}
              onChange={(v) => setOrg(orgs.find((o) => o.uuid === v) ?? null)}
              placeholder="Select organization"
              searchPlaceholder="Search organization…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Transaction reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Monthly subscription"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── Self-subscriptions Tab ─────────── */
function SelfSubscriptionTab() {
  const [status, setStatus] = useState<"pending" | "completed" | "failed" | "expired" | "cancelled" | "all">("all");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-checkouts", status, page],
    queryFn: () =>
      adminService.subscriptionCheckouts({
        status: status === "all" ? undefined : status,
        page,
        limit: 10,
      }),
  });

  const checkoutBadge = (s: string) => {
    const base = "rounded-full capitalize ";
    switch (s) {
      case "completed":
        return <Badge variant="outline" className={`${base}border-success/30 bg-success/10 text-success`}>{s}</Badge>;
      case "failed":
      case "cancelled":
        return <Badge variant="outline" className={`${base}border-destructive/30 bg-destructive/10 text-destructive`}>{s}</Badge>;
      case "expired":
        return <Badge variant="outline" className={`${base}border-muted bg-muted text-muted-foreground`}>{s}</Badge>;
      default:
        return <Badge variant="outline" className={`${base}border-warning/30 bg-warning/10 text-warning-foreground`}>{s}</Badge>;
    }
  };

  const orgStatusBadge = (c: SubscriptionCheckout) => {
    if (c.subscription_status === "active" && c.subscription_expiry) {
      const expiryDate = new Date(String(c.subscription_expiry).replace(" ", "T"));
      if (!isNaN(expiryDate.getTime())) {
        const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        return (
          <Badge variant="outline" className="rounded-full border-success/30 bg-success/10 text-success">
            Active
            <span className="ml-1 text-xs font-normal">({daysLeft}d left)</span>
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="rounded-full border-success/30 bg-success/10 text-success">
          Active
        </Badge>
      );
    }
    if (c.subscription_status === "expired") {
      return (
        <Badge variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 text-destructive">
          Expired
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="rounded-full text-muted-foreground">
        None
      </Badge>
    );
  };

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Self-subscriptions</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          All Safepay/gateway subscriptions for organizations. Each row is a self-service checkout
          initiated by an org admin; the Org Status column shows each organization's current subscription state.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["all", "pending", "completed", "failed", "expired", "cancelled"] as const).map((s) => (
            <Badge
              key={s}
              variant={status === s ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => { setStatus(s); setPage(1); }}
            >
              {s}
            </Badge>
          ))}
        </div>

        {list.isLoading ? (
          <TableSkeleton />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={status === "all" ? "No self-subscriptions" : `No ${status} checkouts`}
            description="Self-service Safepay checkouts initiated by organizations will appear here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Org Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((c: SubscriptionCheckout, i: number) => (
                    <TableRow key={c.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">{(page - 1) * 10 + i + 1}</TableCell>
                      <TableCell data-label="Organization" className="font-medium">{c.organization_name ?? "—"}</TableCell>
                      <TableCell data-label="Plan" className="capitalize">{c.plan_name ?? "—"}</TableCell>
                      <TableCell data-label="Gateway" className="capitalize text-muted-foreground">{c.gateway ?? "—"}</TableCell>
                      <TableCell data-label="Amount" className="text-xs text-muted-foreground">
                        {c.amount != null
                          ? `Rs. ${Number(c.amount).toLocaleString()}${c.currency ? ` ${c.currency}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell data-label="Status">{checkoutBadge(c.status)}</TableCell>
                      <TableCell data-label="Org Status">{orgStatusBadge(c)}</TableCell>
                      <TableCell data-label="Date" className="text-xs text-muted-foreground">
                        {formatDate(c.completed_at ?? c.created_at)}
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
  );
}

/* ─────────── Custom Plan Requests Tab ─────────── */
function CustomPlanRequestsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [approveTarget, setApproveTarget] = useState<CustomPlanRequest | null>(null);
  const [dailyQuota, setDailyQuota] = useState<string>("");
  const [price, setPrice] = useState<string>("");

  const list = useQuery({
    queryKey: ["admin-custom-plan-requests", status],
    queryFn: () =>
      adminService.customPlanRequests({
        status: status === "all" ? undefined : status,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
    qc.invalidateQueries({ queryKey: ["admin-custom-plan-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    qc.invalidateQueries({ queryKey: ["admin-orgs-subs"] });
  };

  const approve = useMutation({
    mutationFn: (r: { uuid: string; daily_quota: number; price: number }) =>
      adminService.approveCustomPlanRequest(r.uuid, { daily_quota: r.daily_quota, price: r.price }),
    onSuccess: () => {
      toast.success("Custom plan approved and assigned");
      setApproveTarget(null);
      setDailyQuota("");
      setPrice("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to approve"),
  });

  const deny = useMutation({
    mutationFn: (uuid: string) => adminService.denyCustomPlanRequest(uuid),
    onSuccess: () => {
      toast.success("Custom plan request denied");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to deny"),
  });

  const openApprove = (r: CustomPlanRequest) => {
    setDailyQuota(String(r.requested_quota ?? r.approved_daily_quota ?? ""));
    setPrice(String(r.requested_price ?? r.approved_price ?? ""));
    setApproveTarget(r);
  };

  const confirmApprove = () => {
    if (!approveTarget) return;
    const q = Number(dailyQuota);
    const p = Number(price);
    if (!Number.isInteger(q) || q <= 0) return toast.error("Daily quota must be a positive integer");
    if (!Number.isFinite(p) || p < 0) return toast.error("Price must be a non-negative number");
    approve.mutate({ uuid: approveTarget.uuid, daily_quota: q, price: p });
  };

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-3 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Custom Plan Requests</h3>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["all", "pending", "approved", "denied"] as const).map((s) => (
            <Badge
              key={s}
              variant={status === s ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setStatus(s)}
            >
              {s}
            </Badge>
          ))}
        </div>

        {list.isLoading ? (
          <TableSkeleton />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No custom plan requests"
            description="No custom plan requests match the current filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S.No</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead className="min-w-[200px]">Message</TableHead>
                  <TableHead className="whitespace-nowrap">Requested quota / budget</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Approved quota / price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((r: CustomPlanRequest, i: number) => (
                  <TableRow key={r.uuid}>
                    <TableCell data-label="S.No" className="w-12 text-muted-foreground">{i + 1}</TableCell>
                    <TableCell
                      data-label="Organization"
                      className="font-medium text-foreground"
                    >
                      {r.organization_name ?? "—"}
                    </TableCell>
                    <TableCell
                      data-label="Requested by"
                      className="text-xs text-muted-foreground"
                    >
                      {r.requested_by_name ?? "—"}
                    </TableCell>
                    <TableCell
                      data-label="Message"
                      className="max-w-xs text-muted-foreground"
                    >
                      <span className="line-clamp-2" title={r.message ?? undefined}>
                        {r.message ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell
                      data-label="Requested quota / budget"
                      className="whitespace-nowrap text-xs"
                    >
                      {r.requested_quota != null ? (
                        <span className="font-medium text-foreground">
                          {r.requested_quota}/day
                          {r.requested_price != null && (
                            <span className="font-normal text-muted-foreground">
                              {" · Rs. "}
                              {Number(r.requested_price).toLocaleString()}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell data-label="Status">
                      <Badge
                        variant="outline"
                        className={`rounded-full capitalize ${
                          r.status === "approved"
                            ? "border-success/30 bg-success/10 text-success"
                            : r.status === "denied"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-warning/30 bg-warning/10 text-warning-foreground"
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      data-label="Approved quota / price"
                      className="whitespace-nowrap text-xs"
                    >
                      {r.approved_daily_quota != null ? (
                        <>
                          <span className="font-medium text-foreground">
                            {r.approved_daily_quota}/day
                          </span>
                          <span className="font-normal text-muted-foreground">
                            {" · Rs. "}
                            {Number(r.approved_price ?? 0).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell data-label="Actions" className="text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openApprove(r)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deny.mutate(r.uuid)}
                            disabled={deny.isPending}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Deny
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve custom plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <div className="font-medium text-foreground">{approveTarget?.organization_name}</div>
              {(approveTarget?.requested_quota != null || approveTarget?.requested_price != null) && (
                <div className="mt-1 text-muted-foreground">
                  Requested:{" "}
                  {approveTarget?.requested_quota != null && (
                    <span className="text-foreground">{approveTarget.requested_quota}/day</span>
                  )}
                  {approveTarget?.requested_price != null && (
                    <span className="text-foreground">
                      {approveTarget?.requested_quota != null ? " · " : ""}
                      Rs. {Number(approveTarget.requested_price).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
              {approveTarget?.message && (
                <div className="mt-1 text-muted-foreground">{approveTarget.message}</div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Daily request quota</Label>
                <Input
                  type="number"
                  value={dailyQuota}
                  onChange={(e) => setDailyQuota(e.target.value)}
                  placeholder="e.g. 500"
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly price (Rs.)</Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={confirmApprove} disabled={approve.isPending}>
              {approve.isPending ? "Approving…" : "Approve plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─────────── Plans Tab (admin-managed public plans) ─────────── */
function CustomPlansTab() {
  const list = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => adminService.plans(),
  });
  const items = (list.data?.items ?? []).filter((plan) => plan.is_custom === 1);

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-3 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Custom Plans</h3>
        </div>
        {list.isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No custom plans yet"
            description="Approved custom plan requests will appear here, separate from standard plans."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((plan) => (
              <div key={plan.uuid} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-foreground">{plan.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.billing_period} custom plan</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 rounded-full border-primary/30 text-primary">
                    Custom
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Price</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      Rs. {Number(plan.monthly_price ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Daily quota</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {plan.daily_request_quota}/day
                    </p>
                  </div>
                </div>
                {plan.description ? (
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {plan.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlansTab() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionPlan | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [quota, setQuota] = useState<string>("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [moduleFlags, setModuleFlags] = useState<ModuleFlags>(ALL_MODULE_FLAGS_ON);
  const [isPublic, setIsPublic] = useState(true);
  const [isFree, setIsFree] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);

  const list = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => adminService.plans(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
    qc.invalidateQueries({ queryKey: ["marketing-plans"] });
  };

  const save = useMutation({
    mutationFn: (data: Partial<SubscriptionPlan>) =>
      editing ? adminService.updatePlan(editing.uuid, data) : adminService.createPlan(data),
    onSuccess: () => {
      toast.success(editing ? "Plan updated" : "Plan created");
      setOpenForm(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to save plan"),
  });

  const togglePublic = useMutation({
    mutationFn: (p: SubscriptionPlan) => adminService.togglePlanPublic(p.uuid, p.is_public !== 1),
    onSuccess: () => {
      toast.success("Visibility updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to update"),
  });

  const toggleRecommended = useMutation({
    mutationFn: (p: SubscriptionPlan) =>
      adminService.updatePlan(p.uuid, { is_recommended: p.is_recommended === 1 ? 0 : 1 }),
    onSuccess: () => {
      toast.success("Recommendation updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: (uuid: string) => adminService.deletePlan(uuid),
    onSuccess: () => {
      toast.success("Plan deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to delete plan"),
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPrice("");
    setQuota("");
    setBillingPeriod("monthly");
    setDescription("");
    setFeatures([]);
    setModuleFlags(ALL_MODULE_FLAGS_ON);
    setIsPublic(true);
    setIsFree(false);
    setIsRecommended(false);
    setOpenForm(true);
  };

  const openEdit = (p: SubscriptionPlan) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.monthly_price ?? ""));
    setQuota(String(p.daily_request_quota ?? ""));
    setBillingPeriod(p.billing_period ?? "monthly");
    setDescription(p.description ?? "");
    setFeatures(
      (p.features ?? []).map((f) =>
        typeof f === "string"
          ? { text: f, highlight: false }
          : { text: f.text, highlight: !!f.highlight },
      ),
    );
    // Pre-fill the module toggles from the plan's saved module_flags; any key
    // missing (or legacy NULL) defaults to ON so nothing is silently locked out.
    setModuleFlags(
      Object.fromEntries(
        MODULE_FEATURES.map(({ key }) => [key, p.module_flags?.[key] ?? true]),
      ) as ModuleFlags,
    );
    setIsPublic(p.is_public === 1);
    setIsFree(p.is_free === 1);
    setIsRecommended(p.is_recommended === 1);
    setOpenForm(true);
  };

  const submitSave = () => {
    if (!name.trim()) return toast.error("Plan name is required");
    if (isFree) {
      save.mutate({
        name: name.trim(),
        is_free: 1,
        monthly_price: 0,
        daily_request_quota: 0,
        billing_period: billingPeriod,
        description: description.trim() || null,
        features: features
          .map((f) => ({ text: f.text.trim(), highlight: !!f.highlight }))
          .filter((f) => f.text),
        module_flags: moduleFlags,
        is_public: isPublic ? 1 : 0,
        is_recommended: isRecommended ? 1 : 0,
      });
      return;
    }
    const p = Number(price);
    const q = Number(quota);
    if (!Number.isFinite(p) || p < 0) return toast.error("Price must be a non-negative number");
    if (!Number.isInteger(q) || q < 0) return toast.error("Daily quota must be a non-negative integer");
    save.mutate({
      name: name.trim(),
      monthly_price: p,
      daily_request_quota: q,
      billing_period: billingPeriod,
      description: description.trim() || null,
      features: features
        .map((f) => ({ text: f.text.trim(), highlight: !!f.highlight }))
        .filter((f) => f.text),
      module_flags: moduleFlags,
      is_public: isPublic ? 1 : 0,
      is_recommended: isRecommended ? 1 : 0,
    });
  };

  const items = (list.data?.items ?? []).filter((plan) => plan.is_custom !== 1);

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Plans</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/pricing"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View public page <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> New Plan
            </Button>
          </div>
        </div>

        {list.isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={Layers} title="No plans yet" description="Create a plan to show it on the marketing site." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">S.No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Quota / Day</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p, i) => (
                  <TableRow key={p.uuid}>
                    <TableCell data-label="S.No" className="w-10 text-muted-foreground">{i + 1}</TableCell>
                    <TableCell data-label="Name" className="font-medium capitalize">
                      <span className="flex items-center gap-2">
                        {p.name}
                        {p.is_free === 1 && (
                          <Badge variant="outline" className="rounded-full border-primary/40 text-primary">
                            Free
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell data-label="Price">Rs. {p.monthly_price?.toLocaleString()}</TableCell>
                    <TableCell data-label="Quota / Day">{p.daily_request_quota}</TableCell>
                    <TableCell data-label="Billing" className="capitalize">{p.billing_period}</TableCell>
                    <TableCell data-label="Features" className="text-muted-foreground">{(p.features ?? []).length}</TableCell>
                    <TableCell data-label="Modules">
                      <div className="flex items-center gap-1">
                        {MODULE_FEATURES.map(({ key, label }) => {
                          const on = p.module_flags?.[key] ?? true;
                          return (
                            <span
                              key={key}
                              title={`${label}: ${on ? "included" : "not included"}`}
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-sm ${
                                on
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            </span>
                          );
                        })}
                        <span className="ml-1.5 text-xs font-medium tabular-nums">
                          {MODULE_FEATURES.filter(({ key }) => p.module_flags?.[key] ?? true).length}/{MODULE_FEATURES.length}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-label="Public">
                      {p.is_custom === 1 ? (
                        <Badge variant="outline" className="rounded-full text-muted-foreground">Custom</Badge>
                      ) : (
                        <Switch
                          checked={p.is_public === 1}
                          onCheckedChange={() => togglePublic.mutate(p)}
                          disabled={togglePublic.isPending}
                        />
                      )}
                    </TableCell>
                    <TableCell data-label="Recommended">
                      <Switch
                        checked={p.is_recommended === 1}
                        onCheckedChange={() => toggleRecommended.mutate(p)}
                        disabled={toggleRecommended.isPending || p.is_custom === 1}
                      />
                    </TableCell>
                    <TableCell data-label="Actions" className="text-right">
                      {p.is_custom !== 1 && (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={p.is_free === 1}
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit plan" : "Create plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plan name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pro" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Price (Rs.)</Label>
                <Input type="number" min="0" value={isFree ? "0" : price} disabled={isFree} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Quota / day</Label>
                <Input type="number" min="0" value={isFree ? "0" : quota} disabled={isFree} onChange={(e) => setQuota(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Billing</Label>
                <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
<div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Free plan</div>
                  <div className="text-xs text-muted-foreground">
                    Auto-assigned to every new organization at Rs. 0 (1 request/day)
                  </div>
                </div>
                <Switch checked={isFree} onCheckedChange={setIsFree} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Recommended</div>
                  <div className="text-xs text-muted-foreground">
                    Highlight this plan on the public /pricing page
                  </div>
                </div>
                <Switch checked={isRecommended} onCheckedChange={setIsRecommended} />
              </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description shown on the pricing page"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Features</Label>
              <div className="space-y-2">
                {features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={f.text}
                      onChange={(e) =>
                        setFeatures(
                          features.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                        )
                      }
                      placeholder="e.g. 50 requests/day"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant={f.highlight ? "default" : "outline"}
                      className="h-9 w-9 shrink-0"
                      title={f.highlight ? "Remove highlight" : "Highlight on pricing page"}
                      onClick={() =>
                        setFeatures(
                          features.map((x, j) => (j === i ? { ...x, highlight: !x.highlight } : x)),
                        )
                      }
                    >
                      <Star className={`h-4 w-4 ${f.highlight ? "fill-current" : ""}`} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground"
                      onClick={() => setFeatures(features.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFeatures([...features, { text: "", highlight: false }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add feature
              </Button>
              <p className="text-xs text-muted-foreground">
                Star a feature to show it bold (highlighted) on the pricing page.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Modules included</Label>
              <div className="space-y-1.5">
                {MODULE_FEATURES.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        Org on this plan gets the {label.toLowerCase()} module
                      </div>
                    </div>
                    <Switch
                      checked={moduleFlags[key]}
                      onCheckedChange={(v) => setModuleFlags({ ...moduleFlags, [key]: v })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                These map to the plan's module_flags. A module switched off is blocked for
                organizations subscribed to this plan.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">Show on marketing site</div>
                <div className="text-xs text-muted-foreground">Display this plan on the public /pricing page</div>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancel</Button>
            <Button onClick={submitSave} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete plan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This cannot be
            undone. Plans assigned to an organization cannot be deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.uuid)}
            >
              {remove.isPending ? "Deleting…" : "Delete plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
