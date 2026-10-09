import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { apiErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { insertAtCaret, mergeRefs } from "@/lib/insertAtCaret";
import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, DataTableToolbar, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { letterTemplatesService, HR_LETTER_TYPES } from "@/services";
import type { LetterTemplate, UUID } from "@/services";

/**
 * Reusable letter templates.
 *
 * Templates are ORG-WIDE: every issued letter was rendered from one, so deleting
 * one is org-admin-only server-side (enforced by the hrLettersOwner gate) even
 * though a sub-admin can still read and use them.
 */
export const Route = createFileRoute("/_app/org/letter-templates")({
  component: LetterTemplatesPage,
});

function LetterTemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LetterTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LetterTemplate | null>(null);

  const query = useQuery({
    queryKey: ["letter-templates"],
    queryFn: () => letterTemplatesService.list({ include_inactive: true }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["letter-templates"] });
  const remove = useMutation({ mutationFn: letterTemplatesService.remove, onSuccess: invalidate });

  const columns: DataTableColumn<LetterTemplate>[] = [
    {
      key: "name",
      header: t("letters.templateName"),
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "letter_type",
      header: t("letters.type"),
      render: (r) => (
        <span className="text-sm">
          {HR_LETTER_TYPES.find((x) => x.key === r.letter_type)?.label ?? r.letter_type}
        </span>
      ),
    },
    {
      key: "merge_fields",
      header: t("letters.mergeTags"),
      render: (r) => {
        // Second line of defence behind toStringArray() in the service layer.
        // Cheap, and it means a stale cache entry or an older backend cannot
        // crash this page the way a raw JSON string did.
        const tags = Array.isArray(r.merge_fields) ? r.merge_fields : [];
        if (!tags.length) return <span className="text-xs text-muted-foreground">—”</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="font-mono text-[10px]">
                ${tag}
              </Badge>
            ))}
            {tags.length > 4 ? (
              <span className="text-xs text-muted-foreground">+{tags.length - 4}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "is_active",
      header: t("letters.status"),
      render: (r) => (
        <Badge variant={r.is_active ? "default" : "secondary"}>
          {r.is_active ? t("letters.active") : t("letters.inactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t("common.save")}
            onClick={() => setEditing(r)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t("common.delete")}
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="hr_letters_management">
      <div className="space-y-4">
        <PageHeader
          title={t("letters.templatesTitle")}
          description={t("letters.templatesDescription")}
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("letters.newTemplate")}
            </Button>
          }
        />

        <DataTableToolbar>
          <p className="text-xs text-muted-foreground">{t("letters.templatesHint")}</p>
        </DataTableToolbar>

        {query.isError ? (
          <EmptyState
            icon={FileText}
            title={t("letters.loadFailed")}
            description={(query.error as Error)?.message}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data?.items ?? []}
            loading={query.isLoading}
            emptyIcon={FileText}
            emptyTitle={t("letters.noTemplates")}
            emptyDescription={t("letters.noTemplatesDescription")}
            showPagination={false}
          />
        )}

        <TemplateDialog
          open={creating || editing !== null}
          template={editing}
          onOpenChange={(v) => {
            if (!v) {
              setCreating(false);
              setEditing(null);
            }
          }}
          onDone={invalidate}
        />

        <ConfirmDialog
          open={deleting !== null}
          title={t("letters.deleteTemplate")}
          description={t("letters.deleteTemplateDescription")}
          confirmLabel={t("common.delete")}
          onConfirm={async () => {
            if (deleting) await remove.mutateAsync(deleting.uuid as UUID);
            setDeleting(null);
          }}
          onOpenChange={(v) => !v && setDeleting(null)}
        />
      </div>
    </ModuleGate>
  );
}

type TemplateFormValues = {
  name: string;
  letterType: string;
  body: string;
};

function defaultsFor(template: LetterTemplate | null): TemplateFormValues {
  return {
    name: template?.name ?? "",
    letterType: template?.letter_type ?? "increment",
    body: template?.body ?? "Dear $employee_name,\n\n\n\nReference: $reference_no",
  };
}

/**
 * Owns the form and hands the SAME instance to FormDialog and to the fields.
 *
 * Deliberately NOT useFormContext(). The context provider lives inside
 * FormDialog's children, so anything that calls useFormContext() while rendering
 * ABOVE FormDialog — which is where this component sits — gets null and crashes
 * with "Cannot destructure property 'register' of 'useFormContext(...)'". Passing
 * the instance explicitly is scope-independent and cannot break that way again.
 */
function TemplateDialog({
  open,
  template,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  template: LetterTemplate | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<TemplateFormValues>({ defaultValues: defaultsFor(template) });

  // This component stays mounted across edits, and useForm only reads
  // defaultValues once. Without the reset, opening template A then template B
  // would keep showing A's text in B's dialog.
  useEffect(() => {
    if (open) form.reset(defaultsFor(template));
    // `form` is the stable instance useForm returns, so listing it costs nothing
    // and keeps the reset correct if it is ever replaced.
  }, [open, template, form]);

  const tagsQuery = useQuery({
    queryKey: ["letter-merge-tags"],
    enabled: open,
    queryFn: () => letterTemplatesService.list(),
  });

  const selectedLetterType = form.watch("letterType");
  const compatibleMergeTags = (tagsQuery.data?.merge_tags ?? []).filter((tag) =>
    !tag.letter_types?.length || tag.letter_types.includes(selectedLetterType as LetterTemplate["letter_type"]),
  );

  const save = useMutation({
    mutationFn: (values: TemplateFormValues) =>
      template
        ? letterTemplatesService.update(template.uuid, values as never)
        : letterTemplatesService.create(values as never),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      // xl, not lg: the body editor plus the tag palette need the width, and the
      // dialog already scrolls vertically, so a narrow frame just added a second
      // axis of scrolling on top of it.
      size="xl"
      // A split workspace needs room, and it needs to STOP SCROLLING as a panel.
      // The old shell was an auto-height form inside max-h-[85vh] overflow-y-auto,
      // so a tall body produced an outer scrollbar AND an inner one on the
      // textarea. Fixing the panel height and letting the two columns manage
      // their own overflow is what removes the nesting.
      dialogClassName="sm:max-w-5xl sm:max-h-[90vh] sm:overflow-hidden flex flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      title={template ? t("letters.editTemplate") : t("letters.newTemplate")}
      description={t("letters.templateFormDescription")}
      submitLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) =>
        save.mutateAsync({
          name: String(values.name ?? "").trim(),
          letterType: String(values.letterType ?? "custom"),
          body: String(values.body ?? ""),
        })
      }
    >
      <TemplateFields
        form={form}
        mergeTags={compatibleMergeTags}
        error={save.isError ? apiErrorMessage(save.error, "") : null}
        nameLabel={t("letters.templateName")}
        typeLabel={t("letters.type")}
        bodyLabel={t("letters.body")}
        insertTagLabel={t("letters.insertTag")}
        tagHint={t("letters.tagHint")}
        saveFailed={t("letters.saveFailed")}
        autoTagsLabel={t("letters.autoTags")}
        manualTagsLabel={t("letters.manualTags")}
      />
    </FormDialog>
  );
}

/** Rendered INSIDE FormDialog, so it receives the form as a plain prop. */
export function TemplateFields({
  form,
  mergeTags,
  error,
  nameLabel,
  typeLabel,
  bodyLabel,
  insertTagLabel,
  tagHint,
  saveFailed,
  autoTagsLabel,
  manualTagsLabel,
}: {
  form: UseFormReturn<TemplateFormValues>;
  mergeTags: { tag: string; label?: string; source: string; help?: string; letter_types?: string[] }[];
  error: string | null;
  nameLabel: string;
  typeLabel: string;
  bodyLabel: string;
  insertTagLabel: string;
  tagHint: string;
  saveFailed: string;
  autoTagsLabel: string;
  manualTagsLabel: string;
}) {
  // Ref to the body editor so a chip can insert at the caret. insertAtCaret
  // mutates the DOM and returns the new text; form.setValue is what actually
  // commits it, because dispatching a synthetic input event does not reach a
  // controlled React input's onChange.
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const next = insertAtCaret(bodyRef.current, `$${tag}`);
    // Keep the caret visible: the body is a tall scrolling box, so inserting at
    // the very top while the view is scrolled to the bottom would look like the
    // click did nothing.
    bodyRef.current?.scrollTo?.({ top: bodyRef.current.scrollTop });
    form.setValue("body", next, { shouldDirty: true, shouldTouch: true });
  };

  /**
   * Split by SOURCE, because that is the distinction that changes what the
   * author has to do. A `manual` tag is a value somebody has to supply at issue
   * time; every other tag is filled from the employee, organization or system
   * without anyone typing. An author who cannot tell them apart cannot tell
   * which values the issue form will demand.
   */
  const { auto, manual } = useMemo(() => {
    const a: typeof mergeTags = [];
    const m: typeof mergeTags = [];
    for (const tag of mergeTags) {
      (tag.source === "manual" ? m : a).push(tag);
    }
    return { auto: a, manual: m };
  }, [mergeTags]);

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,30%)_minmax(0,70%)]">
      {/* ---- LEFT: the tag palette -------------------------------------- */}
      <aside className="flex min-h-0 flex-col gap-3 md:overflow-y-auto md:pr-1">
        <p className="text-xs font-medium text-muted-foreground">{insertTagLabel}</p>

        {mergeTags.length === 0 ? null : (
          <>
            {auto.length ? (
              <TagGroup title={autoTagsLabel} tags={auto} onInsert={insertTag} hint={tagHint} />
            ) : null}
            {manual.length ? (
              <TagGroup title={manualTagsLabel} tags={manual} onInsert={insertTag} />
            ) : null}
          </>
        )}
      </aside>

      {/* ---- RIGHT: the form -------------------------------------------- */}
      <div className="flex min-h-0 flex-col gap-3">
        {/* Name and type sit side by side: both are short, and stacking them
            spent vertical space the body editor needs. */}
        <div className="grid shrink-0 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{nameLabel}</span>
            <input
              {...form.register("name", { required: nameLabel })}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">{typeLabel}</span>
            <select
              {...form.register("letterType")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {HR_LETTER_TYPES.map((lt) => (
                <option key={lt.key} value={lt.key}>
                  {lt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex min-h-0 flex-1 flex-col gap-1 text-sm">
          <span className="shrink-0 font-medium">{bodyLabel}</span>
          <BodyEditor form={form} bodyRef={bodyRef} label={bodyLabel} />
        </label>
      </div>

      {/* The server names the offending merge tag; axios's "Request failed with
          status code 400" throws that away. */}
      {error ? (
        <p className="shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
          {error || saveFailed}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One titled group of insertable tags.
 *
 * The friendly label leads and the raw $tag is kept on the same line in a muted
 * mono font, because the author needs both: the label to know what it does, and
 * the exact token to recognise it later in the body text. Showing only the label
 * makes the body unreadable; showing only the token is what this replaced.
 */
function TagGroup({
  title,
  tags,
  onInsert,
  hint,
}: {
  title: string;
  tags: { tag: string; label?: string; source: string; help?: string }[];
  onInsert: (tag: string) => void;
  hint?: string;
}) {
  const isManual = tags[0]?.source === "manual";
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <button
            key={tag.tag}
            type="button"
            onClick={() => onInsert(tag.tag)}
            title={`${insertAt(tag.tag)} ? ${tag.help ?? tag.source}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
              "transition-colors hover:bg-primary hover:text-primary-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "cursor-pointer",
              isManual
                ? "border-primary/30 bg-primary/10 text-primary hover:text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            <span>{tag.label ?? humaniseTag(tag.tag)}</span>
            <span className="font-mono text-[10px] opacity-70">${tag.tag}</span>
            <span className="sr-only">{tag.help ?? `Source: ${tag.source}`}</span>
          </button>
        ))}
      </div>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
    </section>
  );
}

/**
 * Fall back to a readable name when the server sends no label, e.g.
 * "new_salary" -> "New salary". Never return an empty string: a button with no
 * accessible name is unusable with a screen reader.
 */
function humaniseTag(tag: string) {
  const words = tag.replace(/^\$/, "").replace(/_/g, " ").trim();
  if (!words) return tag;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Screen-reader / tooltip text explaining what a chip click does. */
function insertAt(tag: string) {
  return `Insert $${tag} at the cursor`;
}

/**
 * The body textarea, registered AND holding a local ref.
 *
 * mergeRefs is essential: `<Textarea {...form.register("body")} ref={bodyRef} />`
 * would let the later ref prop DISCARD the one register() installed, so
 * react-hook-form would never read the DOM, believe the field was empty, and
 * re-render it back to "" — discarding typed text and every chip insert.
 */
function BodyEditor({
  form,
  bodyRef,
  label,
}: {
  form: UseFormReturn<TemplateFormValues>;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  label: string;
}) {
  const field = form.register("body", { required: label });
  return (
    <Textarea
      {...field}
      ref={mergeRefs(field.ref, bodyRef)}
      // flex-1 + min-h-0 makes the editor FILL the space the panel has left over
      // instead of claiming a fixed rows=16 that overflowed on short screens.
      // min-h-0 is the part that matters: without it a flex child refuses to
      // shrink below its content and pushes the dialog back into scrolling.
      className="min-h-0 flex-1 resize-none font-mono text-xs"
    />
  );
}
