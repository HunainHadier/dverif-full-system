import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { marketingService, type SubscriptionPlan } from "@/services";
import { PlanFeatureList } from "@/components/common/PlanFeatureList";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Dverif" },
      {
        name: "description",
        content:
          "Choose a Dverif plan for your team. Every organization gets 1 free verification request per day.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const plans = useQuery({
    queryKey: ["marketing-plans"],
    queryFn: () => marketingService.listPlans(),
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Dverif
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link to="/login">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-14 text-center">
        <Badge variant="outline" className="mb-4 rounded-full px-3 py-1 text-xs text-muted-foreground">
          Simple, per-day pricing
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Pricing that grows with your team
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every organization gets <span className="font-medium text-foreground">1 free verification
          request per day</span>, on every plan. Upgrade for higher daily limits.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.isLoading ? (
            <p className="col-span-full text-center text-sm text-muted-foreground">Loading plans…</p>
          ) : plans.data && plans.data.length > 0 ? (
            plans.data.map((plan) => <PlanCard key={plan.uuid} plan={plan} />)
          ) : (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              No plans available yet.
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dverif — Document Verification Platform
        </div>
      </footer>
    </div>
  );
}

/**
 * One public plan card.
 *
 * The Free plan is a real row flagged `is_free = 1` and is rendered from the
 * data with no special-casing beyond honest copy: "Rs. 0 /monthly" and "0 paid
 * requests per day" both read as broken for a plan that is genuinely free, has
 * no billing cycle and never expires.
 */
function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const isFree = plan.is_free === 1;
  return (
    <Card
      className={`flex flex-col border-border/70 shadow-none transition-shadow hover:shadow-md ${
        plan.is_recommended === 1 ? "border-primary/60 ring-1 ring-primary/40" : ""
      }`}
    >
      <CardHeader>
        {plan.is_recommended === 1 && (
          <Badge className="mb-2 w-fit gap-1 rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-3 w-3" /> Recommended
          </Badge>
        )}
        <CardTitle className="text-lg capitalize">{plan.name}</CardTitle>
        {plan.description && <CardDescription>{plan.description}</CardDescription>}
        {isFree ? (
          <div className="mt-2">
            <span className="text-3xl font-bold text-foreground">Free</span>
          </div>
        ) : (
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-foreground">
              Rs. {plan.monthly_price?.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">/{plan.billing_period}</span>
          </div>
        )}
        {!isFree && plan.daily_request_quota > 0 && (
          <p className="text-xs text-muted-foreground">
            {plan.daily_request_quota} paid verification requests per day
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <PlanFeatureList
          plan={plan}
          features={plan.features}
          size="md"
          className="space-y-2.5"
          leadingItem={{ text: "1 free request per day (always included)" }}
          fallbackText="Standard verification features"
        />
        <Button asChild className="w-full">
          <Link to="/login">Get started</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
