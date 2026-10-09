import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Acknowledgement for a verification decision — automatic or manual.
 *
 * Why this is a centred dialog and not a toast: approving or rejecting decides
 * somebody's document, and that outcome is exactly the kind of thing a corner
 * toast gets wrong. It slides away before it is read, it races the list refresh
 * that follows the mutation, and on a long list it is missed entirely — leaving
 * a verifier unsure whether the decision they just committed actually landed.
 * A receipt that must be acknowledged removes that ambiguity.
 *
 * It also cannot be dismissed by accident: no close button, no overlay click, no
 * Escape. Only the button closes it. That is deliberate for a receipt — closing
 * it by reflex should not be possible, and there is nothing to cancel because
 * the server has already committed the decision.
 *
 * Outcome is carried by shape and colour together (check vs cross, success vs
 * destructive) so it never depends on colour alone.
 */

type Outcome = "success" | "destructive";

const OUTCOME = {
  success: {
    // 44 is the drawn length of the check path; the cross needs its own so the
    // dash animation sweeps a sensible distance instead of over/under-running.
    dash: 44,
    path: "M14 27l8 8 16-17",
    ring: "bg-success/15",
    ringDelayed: "bg-success/20",
    disc: "bg-success text-success-foreground",
  },
  destructive: {
    dash: 34,
    path: "M16 16l20 20M36 16L16 36",
    ring: "bg-destructive/15",
    ringDelayed: "bg-destructive/20",
    disc: "bg-destructive text-destructive-foreground",
  },
} as const;

export function DecisionResultDialog({
  open,
  onOpenChange,
  outcome,
  title,
  description,
  actionLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcome: Outcome;
  title: string;
  description?: string;
  actionLabel: string;
}) {
  const style = OUTCOME[outcome];

  // Reset then flip on the next frame so the entry animation replays on every
  // open — the stroke offset is class-driven, so a re-render alone would not
  // restart it.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        /* The shared DialogContent always renders its own close button and has no
           prop to suppress it. Hiding the direct-child button is narrower than
           changing the shared component, which every other dialog depends on.
           The dialog is still dismissible only via its own button below, which is
           the point: this is a receipt, not a question. */
        className="max-w-md [&>button:last-child]:hidden"
      >
        <DialogHeader>
          <div className="flex justify-center pt-2 pb-1">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span
                className={cn("absolute inset-0 rounded-full", style.ring, shown && "animate-success-ring")}
              />
              <span
                className={cn(
                  "absolute inset-0 rounded-full",
                  style.ringDelayed,
                  shown && "animate-success-ring-delayed"
                )}
              />
              <span
                className={cn(
                  "relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg",
                  style.disc,
                  shown && "animate-success-pop"
                )}
              >
                <svg
                  viewBox="0 0 52 52"
                  className="h-11 w-11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path
                    d={style.path}
                    style={{ ["--decision-dash" as string]: String(style.dash) }}
                    className={cn("decision-mark", shown && "decision-mark--drawn")}
                  />
                </svg>
              </span>
            </div>
          </div>
          <DialogTitle className="text-center text-xl">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-center">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
