import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { adminService, type DocumentType } from "@/services";
import { apiErrorMessage } from "@/lib/utils";

/**
 * Document-type catalogue management — system admin only.
 *
 * The catalogue used to be a hard-coded array in the frontend with a mirrored
 * alias table in the Python OCR service, so adding a type meant editing code in
 * two repositories and redeploying both. It is now a database table, and the
 * backend pushes it to the OCR service after every change.
 *
 * The `schema_key` column is the part worth understanding: a type is not just a
 * label. The schema decides which fields get extracted from the document, so a
 * type using `generic` will only ever surface a name and a CNIC. The right key is
 * what makes auto-matching work well.
 *
 * That key is TYPED, not picked from a dropdown, and the list of valid keys is
 * read from the OCR service at runtime. This file deliberately contains no list
 * of schemas: it used to carry a 40-entry literal, the Node controller carried a
 * second copy, and the Python registry the third, so a new schema meant three
 * coordinated edits and any of them going unnoticed would offer a key the
 * extractor had never heard of. There is now exactly one definition of what the
 * service can extract, and this panel asks for it.
 */

export function DocumentTypesPanel() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentType | null>(null);

  const [name, setName] = useState("");
  const [schemaKey, setSchemaKey] = useState<string>("generic");
  const [description, setDescription] = useState("");

  const list = useQuery({
    queryKey: ["admin-document-types"],
    queryFn: () => adminService.documentTypes(),
  });

  const sync = useQuery({
    queryKey: ["admin-document-types-sync"],
    queryFn: () => adminService.documentTypeSyncStatus(),
    // The service can restart independently; a stale "in step" badge is worse
    // than a slightly older answer, so this is polled rather than fetched once.
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-document-types"] });
    qc.invalidateQueries({ queryKey: ["admin-document-types-sync"] });
    // Org-facing dropdowns read the same catalogue.
    qc.invalidateQueries({ queryKey: ["document-types"] });
  };

  const create = useMutation({
    mutationFn: () =>
      adminService.createDocumentType({
        name: name.trim(),
        schema_key: schemaKey,
        description: description.trim() || undefined,
      }),
    onSuccess: (t) => {
      toast.success(`"${t.name}" added`);
      setAddOpen(false);
      setName("");
      setSchemaKey("generic");
      setDescription("");
      invalidate();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not add the document type")),
  });

  const toggleActive = useMutation({
    mutationFn: (t: DocumentType) =>
      adminService.updateDocumentType(t.id, { is_active: !t.is_active }),
    onSuccess: (t) => {
      toast.success(t.is_active ? `"${t.name}" is now selectable` : `"${t.name}" hidden`);
      invalidate();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not update the document type")),
  });

  const remove = useMutation({
    mutationFn: (t: DocumentType) => adminService.deleteDocumentType(t.id),
    onSuccess: (_d, t) => {
      toast.success(`"${t.name}" deleted`);
      setToDelete(null);
      invalidate();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not delete the document type")),
  });

  const items = list.data ?? [];
  const activeCount = items.filter((t) => t.is_active).length;
  const syncOk = sync.data?.reachable === true;

  // The valid schema keys are read from the document service, never hardcoded
  // here. This list used to be a 40-entry literal in this file (plus a second
  // copy in the Node controller and a third in the Python registry), which is
  // three places to update for one new schema and a guarantee that one of them
  // goes stale. The service already reports what it can extract over
  // GET /schemas; asking it is both shorter and impossible to desynchronize.
  const schemaKeys = sync.data?.schema_keys ?? [];
  const schemaDetail = sync.data?.schemas?.[schemaKey.trim()];
  // Which schemas the service refuses to auto-approve on, also from the service
  // rather than a local copy of the list.
  const autoMatchIneligible = new Set(sync.data?.auto_match_ineligible ?? []);
  const ineligibleCount = items.filter((t) => autoMatchIneligible.has(t.schema_key)).length;

  // A typed key is only rejected once the service has confirmed what it
  // supports. While unreachable the input is left alone: blocking every save
  // because the OCR service is down would make the catalogue un-editable.
  const trimmedSchemaKey = schemaKey.trim();
  const schemaKeyUnknown =
    syncOk && trimmedSchemaKey !== "" && !schemaKeys.includes(trimmedSchemaKey);
  const schemaKeyInvalid = !trimmedSchemaKey || schemaKeyUnknown;

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileStack className="h-4 w-4" />
                Document types
              </CardTitle>
              <CardDescription className="mt-1">
                {activeCount} of {items.length} active. These are the options every document upload
                and verification request offers.
              </CardDescription>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add document type
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add document type</DialogTitle>
                  <DialogDescription>
                    The schema key decides which fields get read out of the document when it is
                    compared against an employee's reference copy. Type the key the OCR service
                    uses — the valid ones are listed below.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="dt-name">Name</Label>
                    <Input
                      id="dt-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Vaccination Certificate"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dt-schema">Schema key</Label>
                    <Input
                      id="dt-schema"
                      value={schemaKey}
                      onChange={(e) => setSchemaKey(e.target.value)}
                      placeholder="e.g. resume"
                      list="dt-schema-keys"
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono"
                      aria-invalid={schemaKeyUnknown}
                    />
                    {/* Completions come from the document service, so this is
                        never out of date with what it will actually accept. */}
                    <datalist id="dt-schema-keys">
                      {schemaKeys.map((key) => (
                        <option key={key} value={key} />
                      ))}
                    </datalist>

                    {schemaKeyUnknown ? (
                      <p className="text-xs text-destructive">
                        The document service does not know{" "}
                        <span className="font-mono font-medium">{trimmedSchemaKey}</span>. Valid keys:{" "}
                        {schemaKeys.join(", ") || "—"}
                      </p>
                    ) : schemaDetail ? (
                      <p className="text-xs text-muted-foreground">
                        Reads: {schemaDetail.fields.join(", ")}
                        {schemaDetail.required.length > 0
                          ? ` (required: ${schemaDetail.required.join(", ")})`
                          : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Unsure? <span className="font-medium">generic</span> is always safe — it reads
                        the name and CNIC and nothing else. You can change this later.
                      </p>
                    )}
                  </div>

                  {autoMatchIneligible.has(trimmedSchemaKey) && (
                    <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        This document type carries no identifying content, so it will never be
                        auto-approved — every copy goes to a human. That is intentional.
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="dt-desc">Description (optional)</Label>
                    <Input
                      id="dt-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Required for field staff"
                    />
                  </div>
                </div>

                <DialogFooter className="mt-2">
                  <Button variant="outline" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={create.isPending || !name.trim() || schemaKeyInvalid}
                    loading={create.isPending}
                  >
                    Add
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-0">
          {/* Is the OCR service actually aware of these types? A type that only
              exists in the database still works (the service falls back to its
              own list), but it would not extract the schema chosen here — so
              this is worth showing rather than assuming. */}
          <div
            className={`mx-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              sync.isLoading
                ? "border-border text-muted-foreground"
                : syncOk
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}
          >
            {sync.isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking the document service…
              </>
            ) : syncOk ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Document service is up to date
                {typeof sync.data?.catalogue_count === "number" && (
                  <span className="opacity-80">({sync.data.catalogue_count} types known)</span>
                )}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" />
                Document service unreachable — new types will still work, but they fall back to
                reading only the name and CNIC until it is back.
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => sync.refetch()}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Retry
                </Button>
              </>
            )}
          </div>

          {ineligibleCount > 0 && (
            <p className="px-4 text-xs text-muted-foreground">
              {ineligibleCount} of these carry no identifying content and are never auto-approved.
            </p>
          )}

          {list.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading document types…
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No document types yet. Add the first one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t, i) => (
                  <TableRow key={t.id}>
                    <TableCell data-label="#" className="text-muted-foreground">
                      {t.sort_order || i + 1}
                    </TableCell>
                    <TableCell data-label="Name">
                      <div className="font-medium text-foreground">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      )}
                    </TableCell>
                    <TableCell data-label="Schema">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {t.schema_key}
                        </code>
                        {autoMatchIneligible.has(t.schema_key) && (
                          <Badge variant="secondary" className="text-[10px]">
                            never auto-matched
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-label="Status" className="text-center">
                      {t.is_active ? (
                        <Badge variant="outline" className="text-emerald-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Hidden
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="Actions" className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(t)}
                        >
                          {t.is_active ? "Hide" : "Show"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setToDelete(t)}
                          aria-label={`Delete ${t.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete document type?"
        description={
          toDelete
            ? `"${toDelete.name}" will no longer be offered. Verification requests that already use it keep their stored value, so old records still read correctly.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete);
        }}
      />
    </div>
  );
}
