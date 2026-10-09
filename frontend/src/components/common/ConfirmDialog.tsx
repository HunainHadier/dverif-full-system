import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Whether a value is a promise, without assuming the caller typed it as one.
 *
 * onConfirm is declared `() => void`, and callers routinely pass an async
 * function, so its runtime value IS a promise even though the type says
 * otherwise. Checking structurally keeps the shared component working for both
 * without forcing every caller to change its signature.
 */
function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  loading = false,
  error = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  /**
   * Disables the confirm button while the action is in flight.
   *
   * Without this, a slow delete can be confirmed twice, and the second request
   * either 409s ("already deleted") or, worse, succeeds against a row that has
   * since been recreated.
   */
  loading?: boolean;
  /**
   * Server-side failure text, rendered above the buttons.
   *
   * A destructive action that fails must say so. Axios turns a 409 into
   * "Request failed with status code 409", which names no object and explains
   * nothing, so callers pass the server's own message through instead of leaving
   * the dialog looking like it worked.
   */
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  /**
   * Close when the action SUCCEEDS, not when it is clicked.
   *
   * Radix's AlertDialogAction closes the dialog itself on click, before the
   * action's promise settles. That made a FAILED action close the dialog with no
   * message shown - the dialog vanishing reads exactly like success, which is
   * precisely the failure mode the `error` prop exists to prevent.
   *
   * So the click's default is prevented and the result is awaited: fulfilled
   * closes, rejected leaves the dialog open with the error visible. A synchronous
   * onConfirm still closes immediately, so existing callers are unaffected.
   */
  const runConfirm = async () => {
    if (pending || loading) return;
    let result: unknown;
    try {
      result = onConfirm();
    } catch {
      // A synchronous throw is still a failure: leave the dialog open.
      return;
    }

    if (!isThenable(result)) {
      onOpenChange(false);
      return;
    }

    setPending(true);
    try {
      await result;
      onOpenChange(false);
    } catch {
      // Stay open. The caller renders `error`.
    } finally {
      setPending(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    // Never close while an action is in flight, however the close was triggered.
    if ((pending || loading) && !next) return;
    onOpenChange(next);
  };

  const busy = pending || loading;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // Prevent Radix closing on click; runConfirm decides, based on
              // whether the action actually succeeded.
              e.preventDefault();
              void runConfirm();
            }}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {confirmLabel ?? t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
