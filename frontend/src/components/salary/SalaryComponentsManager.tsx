import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Calculator, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  salaryComponentService,
  type SalaryComponent,
} from "@/services";

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

function TypeBadge({ type }: { type: "allowance" | "deduction" }) {
  const { t } = useTranslation();
  const isAllowance = type === "allowance";
  return (
    <Badge
      variant="outline"
      className={
        isAllowance
          ? "rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          : "rounded-full border-rose-500/30 bg-rose-500/10 text-rose-600"
      }
    >
      {t(isAllowance ? "payrollComponents.typeAllowance" : "payrollComponents.typeDeduction")}
    </Badge>
  );
}

export function SalaryComponentsManager() {
  const { user } = useAuth();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const canManage = user?.org_role === "org_admin";
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<"all" | "allowance" | "deduction">("all");

  const listQ = useQuery({
    queryKey: ["org-salary-components", typeFilter],
    queryFn: () => salaryComponentService.list(typeFilter === "all" ? undefined : typeFilter),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [form, setForm] = useState({
    type: "allowance" as "allowance" | "deduction",
    name: "",
    is_percentage: false,
  });
  const [toDelete, setToDelete] = useState<SalaryComponent | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: "allowance", name: "", is_percentage: false });
    setDialogOpen(true);
  };
  const openEdit = (c: SalaryComponent) => {
    setEditing(c);
    setForm({
      type: c.type,
      name: c.name,
      is_percentage: !!c.is_percentage,
    });
    setDialogOpen(true);
  };

  const invalidateComponents = () => qc.invalidateQueries({ queryKey: ["org-salary-components"] });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        is_percentage: form.is_percentage,
      };
      return editing
        ? salaryComponentService.update(editing.uuid, payload)
        : salaryComponentService.create({ ...payload, type: form.type });
    },
    onSuccess: (comp: SalaryComponent) => {
      toast.success(t("payrollComponents.updated", { name: comp.name }));
      invalidateComponents();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payrollComponents.saveFailed"))),
  });

  const toggleMut = useMutation({
    mutationFn: (uuid: string) => salaryComponentService.toggleStatus(uuid),
    onSuccess: () => {
      toast.success(t("payrollComponents.statusUpdated"));
      invalidateComponents();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payrollComponents.saveFailed"))),
  });

  const removeMut = useMutation({
    mutationFn: (uuid: string) => salaryComponentService.remove(uuid),
    onSuccess: () => {
      toast.success(
        t("payrollComponents.deleted", { name: toDelete?.name ?? "" }),
      );
      invalidateComponents();
      setToDelete(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payrollComponents.deleteFailed"))),
  });

  const items = listQ.data ?? [];

  const moduleLocked = isModuleFlagOff("payroll_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="payroll_management" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payrollComponents.title")}
        description={t("payrollComponents.desc")}
        actions={
          <Button size="sm" disabled={isLocked} onClick={openCreate}>
            {isLocked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            {isLocked ? "Subscription Required" : t("payrollComponents.addComponent")}
          </Button>
        }
      />

      <div className="flex gap-2">
        {(["all", "allowance", "deduction"] as const).map((opt) => (
          <Button
            key={opt}
            size="sm"
            variant={typeFilter === opt ? "default" : "outline"}
            onClick={() => setTypeFilter(opt)}
          >
            {t(`payrollComponents.filter${opt.charAt(0).toUpperCase() + opt.slice(1)}`, opt === "all" ? "All" : opt === "allowance" ? "Allowances" : "Deductions")}
          </Button>
        ))}
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          {items.length > 0 ? (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">S.No</TableHead>
                  <TableHead>{t("payrollComponents.name")}</TableHead>
                  <TableHead>{t("payrollComponents.type")}</TableHead>
                  <TableHead>{t("payrollComponents.calculation")}</TableHead>
                  <TableHead>{t("payrollComponents.status")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((c, i) => (
                  <TableRow key={c.uuid} className={c.is_active ? undefined : "opacity-60"}>
                    <TableCell data-label="S.No" className="w-10 text-muted-foreground">{i + 1}</TableCell>
                    <TableCell data-label={t("payrollComponents.name")} className="font-medium text-foreground">{c.name}</TableCell>
                    <TableCell data-label={t("payrollComponents.type")}>
                      <TypeBadge type={c.type} />
                    </TableCell>
                    <TableCell data-label={t("payrollComponents.calculation")}>
                      <Badge
                        variant="outline"
                        className={
                          c.is_percentage
                            ? "rounded-full border-primary/30 bg-primary/10 text-primary"
                            : "rounded-full border-border text-muted-foreground"
                        }
                      >
                        {c.is_percentage
                          ? t("payrollComponents.percentageOfBasic")
                          : t("payrollComponents.fixedAmount")}
                      </Badge>
                    </TableCell>
                    <TableCell data-label={t("payrollComponents.status")}>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!c.is_active}
                          disabled={isLocked || !canManage || toggleMut.isPending}
                          onCheckedChange={() => toggleMut.mutate(c.uuid)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {c.is_active
                            ? t("payrollComponents.active")
                            : t("payrollComponents.inactive")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-label="Actions" className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={isLocked} onClick={() => openEdit(c)}>
                          {isLocked ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        {canManage ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={isLocked}
                            onClick={() => setToDelete(c)}
                          >
                            {isLocked ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : null}

          {!listQ.isLoading && (items ?? []).length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={Calculator}
                title={t("payrollComponents.emptyTitle")}
                description={t("payrollComponents.emptyDesc")}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("payrollComponents.edit") : t("payrollComponents.addComponent")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <div className="space-y-1.5">
                <Label>{t("payrollComponents.type")}</Label>
                <RadioGroup
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as "allowance" | "deduction" })}
                  className="flex gap-6"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <RadioGroupItem value="allowance" />
                    {t("payrollComponents.typeAllowance")}
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <RadioGroupItem value="deduction" />
                    {t("payrollComponents.typeDeduction")}
                  </label>
                </RadioGroup>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("payrollComponents.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t(
                  form.type === "allowance"
                    ? "payrollComponents.namePlaceholderAllowance"
                    : "payrollComponents.namePlaceholderDeduction"
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("payrollComponents.calculation")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.is_percentage ? "outline" : "default"}
                  className="flex-1"
                  onClick={() => setForm({ ...form, is_percentage: false })}
                >
                  {t("payrollComponents.fixedAmount")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.is_percentage ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setForm({ ...form, is_percentage: true })}
                >
                  {t("payrollComponents.percentageOfBasic")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saveMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!form.name.trim() || saveMut.isPending}
              loading={saveMut.isPending}
            >
              {editing ? t("payrollComponents.edit") : t("payrollComponents.addComponent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("payrollComponents.deleteConfirmTitle", { name: toDelete?.name ?? "" })}
        description={t("payrollComponents.deleteConfirmDesc")}
        onConfirm={() => toDelete && removeMut.mutate(toDelete.uuid)}
      />
    </div>
  );
}
