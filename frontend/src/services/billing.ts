/**
 * Payments, subscriptions, plans and public marketing data.
 *
 *  * ModuleFlags, MODULE_FEATURES and ALL_MODULE_FLAGS_ON live in core.ts rather
 *  * than here: they are plan-level ACCESS CONTROL, and the permission layer reads
 *  * them without needing anything else from this file.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  UUID,
  Payment,
  PlanSummary,
  OrgSubscription,
  QuotaStatus,
  CustomPlanRequest,
  SubscriptionPlan,
  SubscriptionCheckout,
  SubscriptionStatusResponse,
  PaymentProvider,
  PurchasablePlan,
} from "./core";
export const paymentService = {
  providers: () =>
    api
      .get<{ providers: PaymentProvider[]; plans: PurchasablePlan[] }>("/payment/providers")
      .then((r) => r.data),
  initiate: (data: { provider: string; plan: string; purpose?: string }) =>
    api
      .post<{
        payment: {
          action_url: string;
          method: string;
          fields: Record<string, string>;
          transaction_reference: string;
          amount: number;
          provider: string;
          provider_label: string;
        };
        plan: PurchasablePlan;
      }>("/payment/initiate", data)
      .then((r) => r.data),
  plan: () =>
    api
      .get<{
        plan: PlanSummary;
        org_subscription: OrgSubscription;
        quota_status: QuotaStatus | null;
        payments: Payment[];
      }>("/payment/plan")
      .then((r) => r.data),
};

export const orgSubscriptionService = {
  quota: () => api.get<QuotaStatus>("/org/subscription/quota").then((r) => r.data),
  customPlanRequests: () =>
    api
      .get<{ items: CustomPlanRequest[] }>("/org/subscription/custom-plan-requests")
      .then((r) => r.data.items),
  requestCustomPlan: (data: {
    message?: string;
    requested_quota: number;
    requested_price?: number | null;
  }) =>
    api
      .post<{ request: CustomPlanRequest }>("/org/subscription/custom-plan-requests", data)
      .then((r) => r.data.request),
  selfSubscribe: (planUuid: UUID, amount?: number) =>
    api
      .post<{ subscription: OrgSubscription }>("/org/subscription/self-subscribe", {
        plan_uuid: planUuid,
        amount,
      })
      .then((r) => r.data.subscription),
  checkout: (planUuid: UUID, purpose?: "subscribe" | "change_plan") =>
    api
      .post<{ checkout: SubscriptionCheckout; redirect_url: string }>(
        "/org/subscription/checkout",
        {
          plan_uuid: planUuid,
          purpose,
        },
      )
      .then((r) => r.data),
  /**
   * Pay for an APPROVED custom plan.
   *
   * Deliberately not `checkout(planUuid)`: that endpoint only accepts public,
   * non-custom plans, and a custom plan is never public because its price was
   * negotiated. So this is the only way to act on an approved custom-plan
   * request, and the plan is activated by paying — approval alone grants nothing.
   */
  customPlanCheckout: (customPlanRequestUuid: UUID) =>
    api
      .post<{ checkout: SubscriptionCheckout; redirect_url: string }>(
        "/org/subscription/custom-plan/checkout",
        { custom_plan_request_uuid: customPlanRequestUuid },
      )
      .then((r) => r.data),
  checkoutStatus: (checkoutId: UUID) =>
    api
      .get<{ checkout: SubscriptionCheckout }>(`/org/subscription/checkout/${checkoutId}`)
      .then((r) => r.data.checkout),
  subscriptionStatus: () =>
    api.get<SubscriptionStatusResponse>("/org/subscription/status").then((r) => r.data),
  /**
   * Cancel a deferred downgrade before it takes effect (clears pending_plan_id).
   * The org stays on its current plan.
   */
  cancelPendingPlan: () =>
    api.delete<SubscriptionStatusResponse>("/org/subscription/pending-plan").then((r) => r.data),
};

export const marketingService = {
  listPlans: () =>
    api.get<{ items: SubscriptionPlan[] }>("/marketing/plans").then((r) => r.data.items),
};
