import type { ModuleFlags, OrgSubscription, SubscriptionPlan } from "@/services";
import { MODULE_FEATURES } from "@/services";

/**
 * How a target plan relates to the plan an organization is currently on.
 *
 * This mirrors the server-side comparison in
 * backend/src/utils/subscriptionTransition.js (comparePlanTier) so the UI can
 * label a purchase correctly BEFORE the payment is made. The server remains the
 * authority: it re-runs the same comparison when the payment clears.
 *
 * The Free plan is a real plan like any other, identified by its `is_free` flag
 * only -- never by a name match or a zero price -- so renaming or repricing it
 * needs no frontend change.
 */
export type PlanTierRelation = "current" | "same" | "upgrade" | "downgrade";

type PlanLike = {
  is_free?: number | boolean | null;
  daily_request_quota?: number | null;
  monthly_price?: number | null;
};

/** A plan as returned by the public plans / plan-list endpoints. */
type PlanLike2 = {
  module_flags?: ModuleFlags | null;
};

const quotaOf = (p?: PlanLike | null) => Number(p?.daily_request_quota ?? 0);
const priceOf = (p?: PlanLike | null) => Number(p?.monthly_price ?? 0);
const isFreeOf = (p?: PlanLike | null) => Number(p?.is_free ?? 0) === 1;

export function planTierRelation(
  current: PlanLike | null | undefined,
  target: PlanLike | null | undefined,
): PlanTierRelation {
  if (!current) return "upgrade";

  // Free is always the lowest tier, whatever its quota/price numbers say, so the
  // flag is checked before anything else.
  const currentIsFree = isFreeOf(current);
  const targetIsFree = isFreeOf(target);
  if (currentIsFree !== targetIsFree) return targetIsFree ? "downgrade" : "upgrade";

  // Daily quota is the functional difference plans are sold on, so it decides
  // next; price only breaks a quota tie.
  const currentQuota = quotaOf(current);
  const targetQuota = quotaOf(target);
  if (targetQuota !== currentQuota) {
    return targetQuota > currentQuota ? "upgrade" : "downgrade";
  }

  const currentPrice = priceOf(current);
  const targetPrice = priceOf(target);
  if (targetPrice !== currentPrice) {
    return targetPrice > currentPrice ? "upgrade" : "downgrade";
  }

  return "same";
}

/**
 * Is this plan the Free plan? Mirrors the server's isFreePlan().
 */
export function isFreePlan(plan?: PlanLike | null): boolean {
  return isFreeOf(plan);
}

/** Human labels for the org modules, keyed by their module_flags key. */
const MODULE_LABEL_TO_KEY = new Map(
  MODULE_FEATURES.map((m) => [m.label.toLowerCase(), m.key as keyof ModuleFlags]),
);

/**
 * Should this feature line be rendered as EXCLUDED (a cross) rather than
 * included (a tick)?
 *
 * The answer comes from `module_flags`, NOT from the feature line's `highlight`
 * flag. Those are not the same thing:
 *
 *   - `module_flags` is the authoritative include/exclude data. It is what the
 *     backend's requireModuleFeature middleware reads on every request, so it
 *     is exactly what the customer will actually be able to use.
 *   - `highlight` is a styling choice on free-text marketing copy. Marking
 *     "Payroll Management" as non-highlighted does not mean it is unavailable --
 *     it just means it is not a headline. Putting a cross on it would tell a
 *     customer their plan lacks a module they can in fact use.
 *
 * So a cross is only rendered when the line names one of the known modules AND
 * that module's flag is off. Non-module lines such as "10 requests per day" are
 * never marked excluded, and a plan with no `module_flags` at all (legacy:
 * unrestricted server-side) shows no crosses.
 */
export function isFeatureExcluded(
  plan: PlanLike2 | null | undefined,
  featureText: string,
): boolean {
  const key = MODULE_LABEL_TO_KEY.get(String(featureText).trim().toLowerCase());
  if (!key) return false; // not a module line -> cannot claim it is excluded
  const flags = plan?.module_flags;
  if (flags == null) return false; // legacy plan: nothing is restricted
  return (flags as Record<string, unknown>)[key] !== true;
}

/**
 * Whether the organization currently holds a live subscription — i.e. whether a
 * purchase would extend the current expiry (renewal) or change plans, rather
 * than being a fresh subscribe.
 *
 * A Free-plan org is a live subscription too: Free is always active and never
 * expires, so `expiry = null` is its normal state, not a lapse.
 */
export function hasLiveSubscription(orgSub: OrgSubscription | undefined | null): boolean {
  if (!orgSub || orgSub.status !== "active") return false;
  if (!orgSub.expiry) return isFreePlan(orgSub);
  const expiry = new Date(orgSub.expiry);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
}

/**
 * Classify a public plan relative to the org's current subscription.
 *
 * The exact-plan check comes first so the org's own plan is always reported as
 * "current" — including the Free plan, whose daily_request_quota is legitimately
 * 0 and would otherwise be misread as "you have no quota, so everything is an
 * upgrade".
 */
export function classifyPlanForOrg(
  orgSub: OrgSubscription | undefined | null,
  target: SubscriptionPlan,
): PlanTierRelation {
  if (!orgSub?.plan_name) return "upgrade";
  if (orgSub.plan_name.toLowerCase() === target.name.toLowerCase()) return "current";
  return planTierRelation(
    {
      is_free: orgSub.is_free ?? (isFreePlan(target) ? 0 : 1),
      daily_request_quota: orgSub.daily_request_quota,
      monthly_price: orgSub.monthly_price,
    },
    target,
  );
}
