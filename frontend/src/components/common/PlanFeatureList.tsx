import { Check, Sparkles, X } from "lucide-react";

import { isFeatureExcluded } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import type { PlanFeature, SubscriptionPlan } from "@/services";

/**
 * Renders a plan's feature list, marking modules the plan does NOT include with
 * a cross instead of a tick.
 *
 * Inclusion comes from the plan's authoritative `module_flags` (the same data
 * requireModuleFeature enforces at request time), never from the feature line's
 * `highlight` flag — that one is only a styling choice on marketing copy. See
 * isFeatureExcluded for the full reasoning.
 */
export function PlanFeatureList({
  plan,
  features,
  size = "sm",
  strikeThrough = true,
  className,
  leadingItem,
  fallbackText,
}: {
  plan: Pick<SubscriptionPlan, "module_flags"> | null | undefined;
  features?: PlanFeature[] | null;
  /** "xs" for the densest cards, "sm" for standard cards, "md" for the public pricing page. */
  size?: "xs" | "sm" | "md";
  /** Dim + strike excluded lines, e.g. for a comparison table. */
  strikeThrough?: boolean;
  className?: string;
  /** An extra always-included line rendered above the features (e.g. the free daily request). */
  leadingItem?: { text: string } | null;
  /** Shown instead of the list when the plan has no features at all. */
  fallbackText?: string | null;
}) {
  const items = features ?? [];
  const icon = size === "md" ? "h-4 w-4" : size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3";
  const text = size === "md" ? "text-sm" : "text-xs";
  const gap = size === "md" ? "gap-2" : "gap-1.5";

  if (items.length === 0) {
    if (!fallbackText) return null;
    return (
      <ul className={cn("space-y-1.5", className)}>
        <li className={cn("flex items-start", gap, text, "text-muted-foreground")}>
          <Sparkles className={cn("mt-0.5 shrink-0 text-primary", icon)} />
          {fallbackText}
        </li>
      </ul>
    );
  }

  const row = (key: React.Key, node: React.ReactNode, excluded: boolean, highlighted?: boolean) => (
    <li
      key={key}
      className={cn(
        "flex items-start",
        gap,
        text,
        excluded || !highlighted ? "text-muted-foreground" : "font-semibold text-foreground",
      )}
    >
      {excluded ? (
        <X className={cn("mt-0.5 shrink-0 text-muted-foreground/60", icon)} />
      ) : (
        <Check
          className={cn("mt-0.5 shrink-0", highlighted ? "text-primary" : "text-success", icon)}
        />
      )}
      {node}
    </li>
  );

  return (
    <ul className={cn("space-y-1.5", className)}>
      {leadingItem ? row("leading", leadingItem.text, false, false) : null}
      {items.map((f, i) => {
        const excluded = isFeatureExcluded(plan, f.text);
        return row(
          i,
          <span className={excluded && strikeThrough ? "line-through" : undefined}>{f.text}</span>,
          excluded,
          f.highlight,
        );
      })}
    </ul>
  );
}
