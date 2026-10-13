import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { orgService, type ManagedOption, type UUID } from "@/services";
import { useAuth } from "@/lib/auth";
import { apiErrorMessage } from "@/lib/utils";

/**
 * Add and remove the org's designations or departments.
 *
 * EXTRACTED FROM EmployeeManager.tsx, which had it inline behind the Add Employee
 * form's "Manage" link. The employee DETAIL page needs the same dialog, and the
 * alternative was a second copy — which is how the delete button loses its
 * `canDelete` role check in one of the two places within a release.
 *
 * WHY IT LIVES NEXT TO THE PICKER RATHER THAN INSIDE IT: the Select can only
 * offer what exists. With no way to create, an admin editing an employee whose
 * department is wrong has to abandon the form, go to a different page, and come
 * back — and on the detail page there was no such link at all, so the only route
 * was to type a name that did not exist.
 *
 * `onChanged` fires after a create or a remove, so a caller whose own Select is
 * open can refresh. The dialog also invalidates the shared list query itself,
 * because both pages read the same `["org-designations"]` / `["org-departments"]`
 * keys and a stale picker here would show an option that no longer exists.
 */
export function ManageOptionsDialog({
  open,
  onOpenChange,
  type,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: "department" | "designation" | null;
  /** Called after a successful add or remove, e.g. to refresh an open picker. */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const isDept = type === "department";
  const title = isDept ? "Manage Departments" : "Manage Designations";
  const noun = isDept ? "Department" : "Designation";
  const { user } = useAuth();
  // Deleting a department is org-admin only, matching the endpoints behind it.
  // Adding is open to anyone who can reach the picker at all, because the
  // alternative is an admin adding one on the employee's behalf.
  const canDelete = user?.org_role === "org_admin";

  const listQ = useQuery({
    queryKey: [isDept ? "org-departments" : "org-designations"],
    queryFn: () => (isDept ? orgService.departments.list() : orgService.designations.list()),
    enabled: open,
  });

  const [name, setName] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [isDept ? "org-departments" : "org-designations"] });
    onChanged?.();
  };

  const createMut = useMutation({
    mutationFn: (n: string) =>
      isDept ? orgService.departments.create(n) : orgService.designations.create(n),
    onSuccess: () => {
      setName("");
      invalidate();
      toast.success(`${noun} added`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Add failed")),
  });

  const removeMut = useMutation({
    mutationFn: (uuid: UUID) =>
      isDept ? orgService.departments.remove(uuid) : orgService.designations.remove(uuid),
    onSuccess: () => {
      invalidate();
      toast.success("Removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Remove failed")),
  });

  const items: ManagedOption[] = listQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`New ${isDept ? "department" : "designation"} name`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) createMut.mutate(name.trim());
              }}
            />
            <Button
              onClick={() => name.trim() && createMut.mutate(name.trim())}
              loading={createMut.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="max-h-60 space-y-1.5 overflow-y-auto">
            {items.map((opt) => (
              <div
                key={opt.uuid}
                className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm"
              >
                <span className="truncate">{opt.name}</span>
                {canDelete ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMut.mutate(opt.uuid)}
                    loading={removeMut.isPending && removeMut.variables === opt.uuid}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {listQ.isLoading ? "Loading…" : "No items yet."}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
