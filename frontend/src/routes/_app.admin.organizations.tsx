import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Pencil, Plus, Trash2, UploadCloud, CreditCard } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { adminService, type Organization, type UUID } from "@/services";
import { formatDate, prettySlug, resolveAssetUrl } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/organizations")({
  head: () => ({ meta: [{ title: "Organizations — Dverif Admin" }] }),
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [toDelete, setToDelete] = useState<UUID | null>(null);

  const list = useQuery({
    queryKey: ["admin-orgs", page, search],
    queryFn: () => adminService.organizations({ page, limit: 10, search }),
  });

  const del = useMutation({
    mutationFn: (uuid: UUID) => adminService.deleteOrganization(uuid),
    onSuccess: () => {
      toast.success("Organization deleted");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Delete failed"),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="The verified organizations in the Dverif network."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add organization
          </Button>
        }
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search organizations…"
            />
          </div>
          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Building2} title="No organizations" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Employees</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((o, i) => {
                    const assigned = Number(o.users_count ?? 0) > 0 || Number(o.requests_count ?? 0) > 0;
                    return (
                    <TableRow key={o.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Name" className="font-medium text-foreground">
                        <div className="flex items-center gap-3">
                          {o.logo ? (
                            <img
                              src={resolveAssetUrl(o.logo)}
                              className="h-8 w-8 rounded-md border border-border object-cover"
                              alt={o.name}
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <Building2 className="h-4 w-4" />
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span>{o.name}</span>
                            {o.admin_name ? (
                              <span className="text-xs font-normal leading-tight text-muted-foreground">
                                {o.admin_name}
                              </span>
                            ) : null}
                            {o.admin_email ? (
                              <span className="text-xs font-normal leading-tight text-muted-foreground/80">
                                {o.admin_email}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-label="Type" className="capitalize text-muted-foreground">
                        {o.organization_type?.replace("_", " ")}
                      </TableCell>
                      <TableCell data-label="Employees" className="text-center">
                        <span className="inline-flex min-w-7 justify-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {o.employees_count ?? 0}
                        </span>
                      </TableCell>
                      <TableCell data-label="Subscription">
                        <OrgSubscriptionBadge org={o} />
                      </TableCell>
                      <TableCell data-label="Added" className="text-xs text-muted-foreground">
                        {formatDate(o.created_at)}
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(o);
                            setOpenForm(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={assigned}
                          title={assigned ? "This organization is assigned and cannot be deleted" : "Delete organization"}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:hover:text-muted-foreground"
                          onClick={() => setToDelete(o.uuid)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
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
      </Card>

      <OrgFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        editing={editing}
        onDone={() => {
          setOpenForm(false);
          qc.invalidateQueries({ queryKey: ["admin-orgs"] });
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete organization?"
        description="This will also affect users and requests linked to this organization."
        onConfirm={() => {
          if (toDelete) del.mutate(toDelete);
          setToDelete(null);
        }}
      />
    </div>
  );
}

function OrgFormDialog({
  open,
  onOpenChange,
  editing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Organization | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const typesQuery = useQuery({
    queryKey: ["admin-org-types"],
    queryFn: () => adminService.organizationTypes(),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [type, setType] = useState<Organization["organization_type"]>("software_house");
  const [businessEmail, setBusinessEmail] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const createType = useMutation({
    mutationFn: (value: string) => adminService.createOrganizationType(value),
    onSuccess: (t) => {
      toast.success("Organization type added");
      qc.invalidateQueries({ queryKey: ["admin-org-types"] });
      setType(t.name as any);
      setShowTypeDialog(false);
      setNewTypeName("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to add type"),
  });

  const deleteType = useMutation({
    mutationFn: (id: number) => adminService.deleteOrganizationType(id),
    onSuccess: () => {
      toast.success("Organization type deleted");
      qc.invalidateQueries({ queryKey: ["admin-org-types"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to delete type"),
  });
  const [typeToDelete, setTypeToDelete] = useState<{ id: number; name: string } | null>(null);

  const typeItems = typesQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setType((editing?.organization_type as any) || "software_house");
      setBusinessEmail(editing?.business_email ?? "");
      setLogo(null);
    }
  }, [open, editing]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("organization_type", type);
      form.append("business_email", businessEmail.trim());
      if (logo) form.append("logo", logo);
      if (editing) {
        await adminService.updateOrganization(editing.uuid, form);
        toast.success("Organization updated");
      } else {
        await adminService.createOrganization(form);
        toast.success("Organization created");
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit organization" : "Add organization"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeItems.length === 0 ? (
                      <SelectItem value="loading" disabled>
                        Loading…
                      </SelectItem>
                    ) : (
                      typeItems.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {prettySlug(t.name)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title="Add new organization type"
                onClick={() => setShowTypeDialog(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Business email</Label>
            <Input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              placeholder="Where SLA reminder emails are sent"
            />
            <p className="text-xs text-muted-foreground">
              Used for automated reminders when this organization is slow to verify documents.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            {(editing?.logo && !logo) ? (
              <div className="relative flex flex-col items-center justify-center rounded-lg border border-border bg-muted/40 px-4 py-5 text-center">
                <img
                  src={resolveAssetUrl(editing.logo)}
                  alt={editing.name}
                  className="mb-2 h-16 w-16 rounded-md border border-border object-cover"
                />
                <label
                  htmlFor="org-logo"
                  className="cursor-pointer text-xs font-medium text-primary hover:underline"
                >
                  Replace logo
                </label>
                <input
                  id="org-logo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : (
              <label
                htmlFor="org-logo"
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-4 py-5 text-center hover:bg-muted/60"
              >
                <UploadCloud className="mb-1.5 h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-foreground">
                  {logo ? logo.name : "Upload logo (PNG or JPG)"}
                </span>
                <input
                  id="org-logo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage organization types</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {typeItems.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{prettySlug(t.name)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setTypeToDelete({ id: t.id, name: t.name })}
                    disabled={deleteType.isPending}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {typeItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No types yet.</p>
              )}
            </div>
            <Label>Type name</Label>
            <div className="flex items-end gap-2">
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. Bank, University, Hospital"
                disabled={createType.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTypeName.trim() && !createType.isPending) {
                    createType.mutate(newTypeName.trim());
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => createType.mutate(newTypeName.trim())}
                disabled={createType.isPending || !newTypeName.trim()}
                className="shrink-0"
              >
                {createType.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!typeToDelete}
        onOpenChange={(o) => !o && setTypeToDelete(null)}
        title="Delete organization type?"
        description={
          typeToDelete
            ? `Delete "${typeToDelete.name}"? Organizations using this type must be reassigned first.`
            : ""
        }
        onConfirm={() => {
          if (typeToDelete) deleteType.mutate(typeToDelete.id);
          setTypeToDelete(null);
        }}
      />
    </Dialog>
  );
}

function OrgSubscriptionBadge({ org }: { org: Organization }) {
  if (org.subscription_status === "active" && org.subscription_expiry) {
    const expiryDate = new Date(String(org.subscription_expiry).replace(" ", "T"));
    if (!isNaN(expiryDate.getTime())) {
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      return (
        <Badge className="rounded-full border-success/30 bg-success/10 text-success" variant="outline">
          <CreditCard className="mr-1 h-3 w-3" />
          Active
          <span className="ml-1 text-xs font-normal">({daysLeft}d)</span>
        </Badge>
      );
    }
  }
  if (org.subscription_status === "expired") {
    return (
      <Badge className="rounded-full border-destructive/30 bg-destructive/10 text-destructive" variant="outline">
        <CreditCard className="mr-1 h-3 w-3" /> Expired
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-full text-muted-foreground">
      No subscription
    </Badge>
  );
}
