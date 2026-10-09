import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, FolderTree } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { assetCategoriesService, type AssetCategory } from "@/services";
import { apiErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/asset-categories")({
  head: () => ({
    meta: [{ title: "Asset Categories — Dverif" }],
  }),
  component: AssetCategoriesPage,
});

type CategoryForm = {
  name: string;
  description: string;
  default_lifespan_months: string;
  is_active: boolean;
};

/**
 * Asset categories: the classes an inventory is grouped by (Laptops, Vehicles,
 * Furniture).
 *
 * Deletion is blocked by the server while a category still holds assets, and the
 * asset_count column is shown precisely so that situation is visible BEFORE the
 * user clicks delete and is refused. A delete button that fails on click is a
 * worse experience than one that explains itself in the row.
 */
function AssetCategoriesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<AssetCategory | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const categories = useQuery({
    queryKey: ["asset-categories", showInactive],
    queryFn: () => assetCategoriesService.list(showInactive),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["asset-categories"] });

  const remove = useMutation({
    mutationFn: (row: AssetCategory) => assetCategoriesService.remove(row.uuid),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const rows = useMemo(() => {
    const items = categories.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.description ?? "").toLowerCase().includes(needle),
    );
  }, [categories.data, search]);

  const columns: DataTableColumn<AssetCategory>[] = [
    {
      key: "name",
      header: t("assets.categoryName"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          {r.description ? (
            <p className="truncate text-xs text-muted-foreground">{r.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "asset_count",
      header: t("assets.assetsInCategory"),
      render: (r) => <span className="font-mono text-xs">{r.asset_count ?? 0}</span>,
    },
    {
      key: "default_lifespan_months",
      header: t("assets.defaultLifespan"),
      render: (r) =>
        r.default_lifespan_months ? (
          <span>{t("assets.months", { count: r.default_lifespan_months })}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "is_active",
      header: t("common.status"),
      render: (r) => (
        <Badge variant={r.is_active ? "default" : "secondary"}>
          {r.is_active ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t("common.edit")}
            onClick={() => {
              setEditing(r);
              setOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            // A disabled control whose title still says "Delete" is a dead button
            // with no explanation, which is the outcome this page set out to
            // avoid. The title has to carry the REASON, because a disabled button
            // cannot be clicked to find out and nothing else on the row says so.
            title={
              (r.asset_count ?? 0) > 0
                ? t("assets.categoryInUse", { count: r.asset_count ?? 0 })
                : t("common.delete")
            }
            disabled={(r.asset_count ?? 0) > 0}
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="asset_management">
      <div className="space-y-4">
        <PageHeader
          title={t("assets.categoriesTitle")}
          description={t("assets.categoriesDescription")}
          actions={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("assets.newCategory")}
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("assets.searchCategories")}
          />
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? t("assets.hideInactive") : t("assets.showInactive")}
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          loading={categories.isLoading}
          emptyIcon={FolderTree}
          emptyTitle={t("assets.noCategories")}
          emptyDescription={t("assets.noCategoriesDescription")}
        />
      </div>

      <CategoryDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        category={editing}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t("common.delete")}
        description={
          deleting
            ? t("assets.deleteCategoryWarning", { name: deleting.name })
            : t("assets.deleteCategoryWarningGeneric")
        }
        confirmLabel={t("common.delete")}
        destructive
        loading={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, t("assets.deleteFailed")) : null}
        onConfirm={() => remove.mutateAsync(deleting!)}
        onOpenChange={(v) => !v && setDeleting(null)}
      />
    </ModuleGate>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: AssetCategory | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(category);

  const form = useForm<CategoryForm>({
    defaultValues: { name: "", description: "", default_lifespan_months: "", is_active: true },
  });
  const { reset } = form;

  // Seed on the closed -> open transition. Without this, opening "New category"
  // after an edit keeps the edited row's values in the form, and saving silently
  // OVERWRITES that category instead of creating a new one.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset(
        category
          ? {
              name: category.name,
              description: category.description ?? "",
              default_lifespan_months: category.default_lifespan_months
                ? String(category.default_lifespan_months)
                : "",
              is_active: Boolean(category.is_active),
            }
          : { name: "", description: "", default_lifespan_months: "", is_active: true },
      );
    }
    wasOpen.current = open;
  }, [open, category, reset]);

  const save = useMutation({
    mutationFn: async (values: CategoryForm) => {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        default_lifespan_months: values.default_lifespan_months
          ? Number(values.default_lifespan_months)
          : null,
      };
      return isEdit
        ? assetCategoriesService.update(category!.uuid, { ...payload, is_active: values.is_active })
        : assetCategoriesService.create(payload);
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={isEdit ? t("assets.editCategory") : t("assets.newCategory")}
      description={
        isEdit ? t("assets.editCategoryDescription") : t("assets.newCategoryDescription")
      }
      submitLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => save.mutateAsync(values)}
      form={form}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("assets.categoryName")}</span>
        <input
          {...form.register("name", { required: t("assets.categoryName") })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("assets.categoryDescriptionLabel")}</span>
        <textarea
          {...form.register("description")}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("assets.defaultLifespan")}</span>
        <input
          type="number"
          min={1}
          {...form.register("default_lifespan_months")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
      </label>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("is_active")} />
          <span>{t("assets.categoryActive")}</span>
        </label>
      ) : null}

      {save.isError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {apiErrorMessage(save.error, t("assets.saveFailed"))}
        </p>
      ) : null}
    </FormDialog>
  );
}
