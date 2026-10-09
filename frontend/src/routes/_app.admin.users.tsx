import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Users as UsersIcon, Mail, UploadCloud, ShieldCheck, ShieldOff, Building2, Trash2, Ban } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchableSelect } from "@/components/common/SearchableSelect";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "./_app.requests";
import { adminService, type AdminUserRecord, type UUID } from "@/services";
import { digitsOnly, formatCNIC, prettySlug, resolveAssetUrl } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/users")({
  head: () => ({ meta: [{ title: "Users — Dverif Admin" }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [toToggle, setToToggle] = useState<AdminUserRecord | null>(null);
  const [toCancel, setToCancel] = useState<AdminUserRecord | null>(null);
  const [toRemove, setToRemove] = useState<AdminUserRecord | null>(null);

  const list = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => adminService.users({ page, limit: 10, search }),
  });

  const resendInvite = useMutation({
    mutationFn: (uuid: UUID) => adminService.resendInvite(uuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("New invite link sent");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to resend invite"),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ uuid, status }: { uuid: UUID; status: "active" | "inactive" }) =>
      adminService.updateUser(uuid, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User Status Updated");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to update status"),
  });

  const cancelInvite = useMutation({
    mutationFn: (uuid: UUID) => adminService.cancelInvite(uuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Invitation cancelled. User marked inactive.");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to cancel invitation"),
  });

  const removeUser = useMutation({
    mutationFn: (uuid: UUID) => adminService.deleteUser(uuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User permanently removed");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to remove user"),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage every user account on the platform."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add user
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
              placeholder="Search by name or email…"
            />
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={UsersIcon}
                title="No users"
                description="Add your first user to get started."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u, i) => (
                    <TableRow key={u.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Name" className="font-medium text-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span>{u.full_name}</span>
                          {u.invitation_pending ? (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-600">
                              <Mail className="h-3 w-3" />
                              Invitation Pending
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell data-label="Email" className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell data-label="Organization" className="text-muted-foreground">
                        {u.organization_name ? (
                          <div className="flex items-center gap-2">
                            {u.organization_logo ? (
                              <img
                                src={resolveAssetUrl(u.organization_logo)}
                                className="h-6 w-6 rounded border border-border object-cover"
                                alt={u.organization_name}
                              />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                                <Building2 className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span>{u.organization_name}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell data-label="Status">
                        <Badge
                          variant="outline"
                          className={
                            u.status === "inactive"
                              ? "rounded-full border-amber-500/30 bg-amber-500/10 text-amber-600"
                              : "rounded-full border-success/30 bg-success/10 text-success"
                          }
                        >
                          {u.status === "inactive" ? "Inactive" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right pr-8">
                        {u.is_verified === "no" ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Resend invite link"
                              onClick={() => resendInvite.mutate(u.uuid)}
                              disabled={resendInvite.isPending}
                              loading={resendInvite.isPending && resendInvite.variables === u.uuid}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-amber-600 disabled:opacity-40"
                              title={u.invitation_pending ? "Cancel invitation" : "No pending invitation"}
                              onClick={() => setToCancel(u)}
                              disabled={cancelInvite.isPending || !u.invitation_pending}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Remove permanently"
                              onClick={() => setToRemove(u)}
                              disabled={removeUser.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            title={u.status === "active" ? "Disable user" : "Enable user"}
                            className={
                              u.status === "active"
                                ? "h-8 w-8 text-muted-foreground hover:text-destructive"
                                : "h-8 w-8 text-muted-foreground hover:text-success"
                            }
                            onClick={() => setToToggle(u)}
                          >
                            {u.status === "active" ? (
                              <ShieldOff className="h-4 w-4" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(u);
                            setOpenForm(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
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
      </Card>

      <UserFormDialog
        key={editing?.uuid ?? "new"}
        open={openForm}
        onOpenChange={setOpenForm}
        editing={editing}
        onDone={() => {
          setOpenForm(false);
          qc.invalidateQueries({ queryKey: ["admin-users"] });
        }}
      />

      <ConfirmDialog
        open={!!toToggle}
        onOpenChange={(o) => !o && setToToggle(null)}
        title={toToggle?.status === "active" ? "Disable this User?" : "Enable this User?"}
        description={
          toToggle?.status === "active"
            ? "This user will no longer be able to log in, and their current sessions will be revoked."
            : "This user will be able to log in again."
        }
        confirmLabel={toToggle?.status === "active" ? "Disable" : "Enable"}
        destructive={toToggle?.status === "active"}
        onConfirm={() => {
          if (toToggle) {
            toggleStatus.mutate({
              uuid: toToggle.uuid,
              status: toToggle.status === "active" ? "inactive" : "active",
            });
            setToToggle(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title="Cancel this invitation?"
        description="The invite link will be invalidated and this user will be marked inactive. The user record is kept."
        confirmLabel="Cancel Invitation"
        onConfirm={() => {
          if (toCancel) cancelInvite.mutate(toCancel.uuid);
          setToCancel(null);
        }}
      />

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Permanently remove this user?"
        description="This permanently deletes the user record and any pending invite. This cannot be undone."
        confirmLabel="Remove Permanently"
        onConfirm={() => {
          if (toRemove) removeUser.mutate(toRemove.uuid);
          setToRemove(null);
        }}
      />
    </div>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdminUserRecord | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const orgs = useQuery({
    queryKey: ["admin-orgs-lookup", "without-admin"],
    queryFn: () => adminService.organizations({ page: 1, limit: 100, without_admin: true }),
    enabled: open,
  });
  const typesQuery = useQuery({
    queryKey: ["admin-org-types"],
    queryFn: () => adminService.organizationTypes(),
    enabled: open,
  });
  const typeItems = typesQuery.data ?? [];

  const createType = useMutation({
    mutationFn: (value: string) => adminService.createOrganizationType(value),
    onSuccess: (t: any) => {
      toast.success("Organization type added");
      qc.invalidateQueries({ queryKey: ["admin-org-types"] });
      setNewOrgType(t.name);
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

  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [cnic, setCnic] = useState(editing?.cnic ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [orgMode, setOrgMode] = useState<"existing" | "new">("existing");
  const [orgName, setOrgName] = useState(editing?.organization_name ?? "");
  const [newOrgType, setNewOrgType] = useState<string>("software_house");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [newOrgLogo, setNewOrgLogo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  useEffect(() => {
    if (open && !editing) {
      setFullName("");
      setEmail("");
      setCnic("");
      setPhone("");
      setOrgMode("existing");
      setOrgName("");
      setNewOrgType("software_house");
      setNewOrgEmail("");
      setNewOrgLogo(null);
    }
  }, [open, editing]);

  const orgList = orgs.data?.items ?? [];
  const selectedOrg = orgList.find((o) => o.name === orgName);

  const submit = async () => {
    setSubmitting(true);
    try {
      if (editing) {
        await adminService.updateUser(editing.uuid, {
          full_name: fullName,
          phone,
          cnic: cnic || null,
        });
        toast.success("User updated");
      } else {
        if (!fullName || !email) {
          toast.error("Name and email are required");
          setSubmitting(false);
          return;
        }

        const orgPayload =
          orgMode === "existing" && selectedOrg
            ? { name: selectedOrg.name }
            : { name: orgName, organization_type: newOrgType, business_email: newOrgEmail.trim() };

        const form = new FormData();
        form.append("organization", JSON.stringify(orgPayload));
        form.append("user", JSON.stringify({ full_name: fullName, email, phone, cnic: cnic || null }));
        if (orgMode === "new" && newOrgLogo) {
          form.append("org_logo", newOrgLogo);
        }
        const result = await adminService.createUser(form);
        if (result._email_warning) {
          toast.warning("User created but invite email failed. Use Resend Invite to retry.");
        } else {
          toast.success("User created. Invite email sent.");
        }
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
      <DialogContent className="w-[calc(100%-1rem)] max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editing}
              />
            </div>
            <div className="space-y-2">
                  <Label>CNIC (optional)</Label>
                  <Input
                    value={cnic}
                    onChange={(e) => setCnic(formatCNIC(e.target.value))}
                    placeholder="35202-1234567-1"
                    maxLength={15}
                    inputMode="numeric"
                  />
                </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} />
            </div>
          </div>

          {!editing ? (
            <>
              <Separator />
              <div>
                <Label className="mb-2 block">Organization</Label>
                <div className="mb-3 inline-flex rounded-md border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setOrgMode("existing")}
                    className={
                      orgMode === "existing"
                        ? "rounded bg-accent px-3 py-1 font-medium text-foreground"
                        : "px-3 py-1 text-muted-foreground"
                    }
                  >
                    Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrgMode("new")}
                    className={
                      orgMode === "new"
                        ? "rounded bg-accent px-3 py-1 font-medium text-foreground"
                        : "px-3 py-1 text-muted-foreground"
                    }
                  >
                    Create new
                  </button>
                </div>
                {orgMode === "existing" ? (
                  <SearchableSelect
                    items={(orgList ?? []).map((o) => ({ value: o.name, label: o.name }))}
                    value={orgName}
                    onChange={setOrgName}
                    placeholder="Select organization"
                    searchPlaceholder="Search organization…"
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Name</Label>
                      <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Type</Label>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <Select value={newOrgType} onValueChange={setNewOrgType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {typesQuery.data?.length === 0 ? (
                                <SelectItem value="loading" disabled>
                                  Loading…
                                </SelectItem>
                              ) : (
                                (typesQuery.data ?? []).map((t) => (
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
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Business email</Label>
                      <Input
                        type="email"
                        value={newOrgEmail}
                        onChange={(e) => setNewOrgEmail(e.target.value)}
                        placeholder="Where SLA reminder emails are sent"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used for automated reminders when this organization is slow to verify documents.
                      </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Logo</Label>
                      <label
                        htmlFor="org-logo"
                        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-4 py-4 text-center hover:bg-muted/60"
                      >
                        <UploadCloud className="mb-1.5 h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {newOrgLogo ? newOrgLogo.name : "Upload logo (PNG or JPG)"}
                        </span>
                        <input
                          id="org-logo"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setNewOrgLogo(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} loading={submitting}>
            {editing ? "Save changes" : "Create user"}
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



