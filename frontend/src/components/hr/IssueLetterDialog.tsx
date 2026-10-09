import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { letterTemplatesService, hrLettersService, type HrLetterListItem } from "@/services";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * Collects the merge-tag values a draft is still missing, then issues it.
 *
 * Why this dialog exists: the backend refuses to issue while any merge tag is
 * unresolved, and it reports exactly which ones. A menu item that POSTed
 * /issue directly therefore produced a hard 400 for every draft whose template
 * uses a manual tag (e.g. $new_salary on an increment letter) — the user was
 * asked to confirm issuing a letter that could not be issued. This dialog closes
 * that loop: preview -> fill -> issue.
 *
 * Issuance is one-way, so the preview is shown before anything is committed.
 */
export function IssueLetterDialog({
  letter,
  open,
  onOpenChange,
  onIssued,
}: {
  letter: HrLetterListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const templateUuid = letter?.template_uuid ?? null;
  const hasTemplate = Boolean(templateUuid);

  /**
   * Tags we render an input for. Kept SEPARATE from the server's
   * `missing_manual`, and only ever grows.
   *
   * This is the bug that made the modal unusable: driving the inputs straight
   * from `missing_manual` meant the first character of "85000" satisfied the
   * tag, the preview refetched with `missing_manual: []`, and React unmounted
   * the input that was being typed into. Focus was lost mid-word, so the user
   * got one digit and an apparently closed dialog.
   *
   * The fields now persist for the life of the dialog, so a value can be
   * corrected rather than re-typed, and the caret never vanishes.
   */
  const [fields, setFields] = useState<string[]>([]);

  /**
   * Debounce the preview: without it every keystroke fired a POST, which both
   * hammered the API and made the query flip between loading and loaded while
   * the user was mid-word.
   */
  const debouncedValues = useDebouncedValue(values, 400);

  const {
    data: preview,
    isFetching,
    isPending,
    error,
  } = useQuery({
    queryKey: ["hr-letter-preview", templateUuid, letter?.employee_uuid, debouncedValues],
    enabled: open && hasTemplate,
    /**
     * Hold the PREVIOUS preview while the next one loads.
     *
     * This is what stopped the dialog blinking on every keystroke: the query key
     * contains the values, so a new key meant `preview` was instantly undefined
     * and the box swapped to its spinner, then back to text ~200ms later. The
     * stale-but-valid preview staying put is both calmer and more useful — the
     * user can read what they typed without watching it flash.
     */
    placeholderData: (previous) => previous,
    queryFn: () =>
      letterTemplatesService.preview(templateUuid as string, {
        employee_uuid: letter!.employee_uuid,
        values: debouncedValues,
      }),
  });

  // Grow the field set as the server reports new missing tags. Never shrink it:
  // a field the user has already typed into must stay mounted and keep focus.
  useEffect(() => {
    const missingNow = preview?.missing_manual;
    if (!missingNow?.length) return;
    setFields((prev) => {
      const next = new Set(prev);
      for (const tag of missingNow) next.add(tag);
      return next.size === prev.length ? prev : [...next];
    });
  }, [preview?.missing_manual]);

  /**
   * Re-seed from the draft's stored payload on the closed->open transition
   * only. Seeding on every `open`/uuid change would wipe what the user is
   * typing whenever the parent re-rendered.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setValues({ ...(letter?.payload ?? {}) });
      setFields([]);
    }
    wasOpen.current = open;
  }, [open, letter?.uuid, letter?.payload]);

  const issue = useMutation({
    mutationFn: () => hrLettersService.issue(letter!.uuid, values),
    onSuccess: () => {
      toast.success(t("letters.issuedToast"));
      onOpenChange(false);
      onIssued();
      void qc.invalidateQueries({ queryKey: ["hr-letters"] });
    },
    onError: (e: Error) => toast.error(t("letters.issueFailedToast"), { description: e.message }),
  });

  /** Tags referenced but with no source at all — a template bug, not user input. */
  const unknown = useMemo(() => preview?.unknown ?? [], [preview]);

  const unresolved = useMemo(() => preview?.unresolved ?? [], [preview]);

  /**
   * Whether Issue is currently allowed.
   *
   * Deliberately NOT gated on `isFetching`. Tying the button to in-flight state
   * made it flicker disabled/enabled on every keystroke, which reads as the
   * dialog blinking. The preview it waits on is debounced and always the last
   * settled one, so a stale `unresolved` list is the safe direction to err:
   * the user can always wait a moment and submit.
   *
   * `isPending` is used instead: only the very first preview blocks, before
   * there is any basis for a decision.
   */
  const blocked = unresolved.length > 0 || unknown.length > 0 || isPending;

  /**
   * Turn `$new_salary` into "New salary".
   *
   * Prefers the server's label so `cnic` renders as "CNIC" and not "Cnic" —
   * humanising a short acronym produces nonsense. Falls back to the raw tag so
   * the field is still identifiable if the label map is absent, which it is
   * against an older backend.
   */
  const humanise = (tag: string) => {
    const known = preview?.tag_labels?.[tag];
    if (known) return known;
    const words = tag.replace(/^\$/, "").replace(/_/g, " ").trim();
    if (!words) return tag;
    return words.charAt(0).toUpperCase() + words.slice(1);
  };

  if (!letter) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("letters.issueLetter")}</DialogTitle>
          <DialogDescription>{t("letters.issueDescription")}</DialogDescription>
        </DialogHeader>

        {!hasTemplate ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("letters.issueNoTemplate")}</AlertDescription>
          </Alert>
        ) : (
          <>
            {unknown.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("letters.issueUnknownTags", {
                    tags: unknown.map((x) => `$${x}`).join(", "),
                  })}
                </AlertDescription>
              </Alert>
            )}

            {fields.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("letters.missingTagsHint")}</p>
                {fields.map((tag) => (
                  <div key={tag} className="space-y-1.5">
                    <Label htmlFor={`tag-${tag}`}>{humanise(tag)}</Label>
                    <Input
                      id={`tag-${tag}`}
                      value={values[tag] ?? ""}
                      placeholder={t("letters.tagPlaceholder")}
                      onChange={(e) => setValues((prev) => ({ ...prev, [tag]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("letters.preview")}</Label>
                {/* Dim the box rather than replacing it. Swapping content is
                    what reads as a blink; a small opacity change does not. */}
                {isFetching && preview ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("letters.previewUpdating")}
                  </span>
                ) : null}
              </div>
              <div
                className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 transition-opacity"
                style={{ opacity: isFetching && preview ? 0.6 : 1 }}
              >
                {error ? (
                  <p className="text-sm text-destructive">{t("letters.previewFailed")}</p>
                ) : !preview ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{preview.text}</pre>
                )}
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={issue.isPending}>
            {t("hr.formDialog.cancel")}
          </Button>
          <Button
            onClick={() => issue.mutate()}
            disabled={blocked || !hasTemplate || issue.isPending}
          >
            {issue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("letters.issueLetter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
