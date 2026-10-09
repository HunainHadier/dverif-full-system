import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Building2,
  Send,
  Users,
  UserCheck,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldX,
  Eye,
  Wallet,
  CalendarDays,
  ClipboardCheck,
  CalendarClock,
  CalendarCheck,
  Lock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { dashboardService, type AdminAnalytics, type OrgDashboardAnalytics } from "@/services";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import {
  leavesService,
  salaryService,
  attendanceService,
  orgLeavesService,
  orgSubscriptionService,
  type LeaveBalance,
  type SalaryRecord,
} from "@/services";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Dverif" }] }),
  component: DashboardPage,
});

type Stat = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href: string;
  hint?: string;
  progress?: number;
};

function money(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ratioProgress(value: number | string | null | undefined, total: number | string | null | undefined) {
  const numerator = Number(value);
  const denominator = Number(total);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}

function normalizeProgress(value: number | undefined) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(100, Math.max(0, numericValue));
}

function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const orgRole = user?.org_role;
  const firstName = user ? `, ${user.full_name.split(" ")[0]}` : "";

  if (isAdmin) return <SystemAdminDashboard />;
  if (orgRole === "employee") return <EmployeeDashboard firstName={firstName} />;
  if (orgRole === "sub_admin") return <SubAdminDashboard />;
  return <OrgAdminDashboard firstName={firstName} />;
}

/* ------------------------------------------------------------------ */
/* System admin — global verification/system overview                  */
/* ------------------------------------------------------------------ */
function SystemAdminDashboard() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: () => dashboardService.auto(),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["dashboard", "admin", "analytics"],
    queryFn: () => dashboardService.analytics(),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const analytics = analyticsQ.data;

  const data = q.data;
  const adminStatsRow1: Stat[] = [
    {
      label: t("dashboard.totalUsers"),
      value: data?.total_users ?? 0,
      icon: Users,
      href: "/admin/users",
      progress: ratioProgress(data?.active_users, data?.total_users),
    },
    {
      label: t("dashboard.organizations"),
      value: data?.total_organizations ?? 0,
      icon: Building2,
      href: "/admin/organizations",
      progress: ratioProgress(data?.verified_organizations, data?.total_organizations),
    },
    {
      label: t("dashboard.unmatchedOrgs"),
      value: data?.total_admin_requests ?? 0,
      icon: AlertTriangle,
      href: "/admin/null-requests",
      progress: ratioProgress(data?.total_admin_requests, data?.total_verification_requests),
      hint: t("dashboard.pendingAdminReview"),
    },
  ];

  const adminStatsRow2: Stat[] = [
    {
      label: t("dashboard.totalRequests"),
      value: data?.total_verification_requests ?? 0,
      icon: Send,
      href: "/admin/requests",
      progress: ratioProgress(data?.verified_requests, data?.total_verification_requests),
    },
    {
      label: t("dashboard.verifiedRequests"),
      value: data?.verified_requests ?? 0,
      icon: ShieldCheck,
      href: "/admin/requests",
      progress: ratioProgress(data?.verified_requests, data?.total_verification_requests),
    },
    {
      label: t("dashboard.unverifiedRequests"),
      value: data?.unverified_requests ?? 0,
      icon: ShieldX,
      href: "/admin/requests",
      progress: ratioProgress(data?.unverified_requests, data?.total_verification_requests),
    },
    {
      label: t("dashboard.underReview"),
      value: data?.under_review_requests ?? 0,
      icon: Eye,
      href: "/admin/requests",
      progress: ratioProgress(data?.under_review_requests, data?.total_verification_requests),
    },
  ];

  const renderStatCards = (stats: Stat[], isLoading: boolean, skeletonCount: number) => (
    (isLoading ? Array.from({ length: skeletonCount }) : stats).map((raw, i) => {
      const s = raw as Stat | undefined;
      return (
        <Card key={i} className="border-border/70 shadow-none">
          <CardContent className="p-5">
            {s ? (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <Link
                    to={s.href}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("dashboard.viewAll")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="mt-5">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
                </div>
                <Progress value={normalizeProgress(s.progress)} className="mt-4 h-1.5" />
                {s.hint ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{s.hint}</p>
                ) : null}
              </>
            ) : (
              <div className="flex h-[104px] items-center justify-center">
                <DverifLoader size="sm" />
              </div>
            )}
          </CardContent>
        </Card>
      );
    })
  );

  return (
    <div>
      <PageHeader
        title={t("dashboard.adminOverview")}
        description={t("dashboard.adminOverviewSub")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {renderStatCards(adminStatsRow1, q.isLoading, 3)}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {renderStatCards(adminStatsRow2, q.isLoading, 4)}
      </div>

      {data?.upcoming_expirations && data.upcoming_expirations.length > 0 && (
        <Card className="mt-6 border-border/70 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-foreground">
                {t("dashboard.upcomingExpirations")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.expiringSubtitle")}</p>
            <div className="mt-4 space-y-2">
              {data.upcoming_expirations.map((exp) => {
                const expiryDate = new Date(String(exp.subscription_expiry).replace(" ", "T"));
                const now = new Date();
                const hoursLeft = Math.max(
                  0,
                  Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60)),
                );
                const isUrgent = hoursLeft <= 2;
                return (
                  <div
                    key={exp.uuid}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-md ${isUrgent ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}
                      >
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{exp.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("dashboard.expires")}: {formatDate(exp.subscription_expiry)}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        isUrgent
                          ? "border-red-500/30 bg-red-500/10 text-red-500"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                      }
                    >
                      {isUrgent
                        ? `${hoursLeft}${t("dashboard.hLeft")}`
                        : `${Math.ceil(hoursLeft / 24)}${t("dashboard.dLeft")}`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {analytics && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <RequestsPerMonthChart data={analytics.requests_per_month} />
          </div>
          <div className="lg:col-span-2">
            <OrgsPerMonthChart data={analytics.orgs_registered_per_month} />
          </div>
          <RequestStatusChart data={analytics.request_status_breakdown} />
          <TopOrgsChart data={analytics.top_organizations_by_requests} />
        </div>
      )}

      {!analytics && analyticsQ.isLoading && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/70 shadow-none">
              <CardContent className="flex h-[300px] items-center justify-center">
                <DverifLoader size="sm" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chart helper: format "YYYY-MM" → "MMM YY"                          */
/* ------------------------------------------------------------------ */
const CHART_COLORS = {
  primary: "hsl(var(--chart-1, 142 76% 36%))",
  secondary: "hsl(var(--chart-2, 221 83% 53%))",
  tertiary: "hsl(var(--chart-3, 47 100% 50%))",
  quaternary: "hsl(var(--chart-4, 0 84% 60%))",
};

const PIE_COLORS = [
  "hsl(var(--chart-1, 142 76% 36%))",
  "hsl(var(--chart-2, 221 83% 53%))",
  "hsl(var(--chart-3, 47 100% 50%))",
  "hsl(var(--chart-4, 0 84% 60%))",
];

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  unverified: "Unverified",
  under_review: "Under Review",
};

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

/* ─── Requests per Month (Bar) ─── */
function RequestsPerMonthChart({ data }: { data: AdminAnalytics["requests_per_month"] }) {
  const chartData = data.map((d) => ({ name: formatMonth(d.month), requests: d.count }));

  return (
    <ChartCard title="Requests per Month (Last 12 Months)">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: 12,
              }}
            />
            <Bar dataKey="requests" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ─── Request Status Breakdown (Pie/Donut) ─── */
function RequestStatusChart({ data }: { data: AdminAnalytics["request_status_breakdown"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d.count,
    percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
  }));

  return (
    <ChartCard title="Request Status Breakdown">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((_entry, index) => (
                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => value}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ─── New Organizations per Month (Bar) ─── */
function OrgsPerMonthChart({ data }: { data: AdminAnalytics["orgs_registered_per_month"] }) {
  const chartData = data.map((d) => ({ name: formatMonth(d.month), orgs: d.count }));

  return (
    <ChartCard title="New Organizations per Month (Last 12 Months)">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: 12,
              }}
            />
            <Bar dataKey="orgs" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ─── Top 10 Organizations by Requests (Horizontal Bar) ─── */
function TopOrgsChart({ data }: { data: AdminAnalytics["top_organizations_by_requests"] }) {
  const chartData = [...data].reverse().map((d) => ({
    name: d.org_name.length > 20 ? d.org_name.slice(0, 20) + "…" : d.org_name,
    requests: d.request_count,
  }));

  return (
    <ChartCard title="Top 10 Organizations by Requests (Last 90 Days)">
      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No organization data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="requests" fill={CHART_COLORS.tertiary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Org admin — verification-request widgets (kept as before)           */
/* ------------------------------------------------------------------ */
function OrgAdminDashboard({ firstName }: { firstName: string }) {
  const { t } = useTranslation();
  const { isLocked } = useOrgSubscription();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ["dashboard", "org_admin"],
    queryFn: () => dashboardService.auto(),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["org-dashboard-analytics"],
    queryFn: () => dashboardService.orgAnalytics(),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const data = q.data;
  const analytics = analyticsQ.data;

  const requestTotal = Number(data?.total_verification_requests ?? 0);
  const userStats: Stat[] = [
    {
      label: t("dashboard.myRequestsSent"),
      value: requestTotal,
      icon: Send,
      href: "/requests",
      progress: ratioProgress(data?.verified_requests, requestTotal),
    },
    {
      label: t("dashboard.verified"),
      value: data?.verified_requests ?? 0,
      icon: ShieldCheck,
      href: "/requests",
      progress: ratioProgress(data?.verified_requests, requestTotal),
    },
    {
      label: t("dashboard.unverified"),
      value: data?.unverified_requests ?? 0,
      icon: ShieldX,
      href: "/requests",
      progress: ratioProgress(data?.unverified_requests, requestTotal),
    },
    {
      label: t("dashboard.underReview"),
      value: data?.under_review_requests ?? 0,
      icon: Eye,
      href: "/requests",
      progress: ratioProgress(data?.under_review_requests, requestTotal),
    },
  ];

  const hrStats: Stat[] = [
    {
      label: "Active Employees",
      value: analytics?.active_employee_count ?? 0,
      icon: Users,
      href: "/org/team",
    },
    {
      label: "Pending Leaves",
      value: analytics?.pending_leave_requests_count ?? 0,
      icon: ClipboardCheck,
      href: "/org/leaves",
    },
    {
      label: "Today's Attendance",
      value: analytics
        ? `${analytics.today_attendance.present} / ${analytics.today_attendance.total}`
        : "— / —",
      icon: UserCheck,
      href: "/org/attendance",
      hint: analytics ? `${analytics.today_attendance.total - analytics.today_attendance.present} absent` : undefined,
    },
    {
      label: "This Month Payroll",
      value: analytics ? `PKR ${analytics.this_month_payroll_total.toLocaleString()}` : "—",
      icon: Wallet,
      href: "/org/payroll",
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${t("dashboard.welcomeBack")}${firstName}`}
        description={isLocked ? t("dashboard.lockedSub") : t("dashboard.trackSub")}
      />

      {/* Verification request stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(q.isLoading ? Array.from({ length: userStats.length }) : userStats).map((raw, i) => {
          const s = raw as Stat | undefined;
          const cardLocked = isLocked;
          return (
            <Card
              key={i}
              className={`border-border/70 shadow-none ${cardLocked ? "opacity-60" : ""}`}
            >
              <CardContent className="p-5">
                {s ? (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <s.icon className="h-4 w-4" />
                      </div>
                      {cardLocked ? (
                        <Link
                          to="/payments"
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive hover:text-destructive"
                        >
                          <Lock className="h-3 w-3" /> {t("dashboard.locked")}
                        </Link>
                      ) : (
                        <Link
                          to={s.href}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          {t("dashboard.viewAll")} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="mt-5">
                      <div className="text-2xl font-semibold tracking-tight text-foreground">
                        {s.value.toLocaleString()}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
                    </div>
                    <Progress value={normalizeProgress(s.progress)} className="mt-4 h-1.5" />
                    {s.hint ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">{s.hint}</p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-[104px] items-center justify-center">
                    <DverifLoader size="sm" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* HR overview stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(analyticsQ.isLoading ? Array.from({ length: hrStats.length }) : hrStats).map((raw, i) => {
          const s = raw as Stat | undefined;
          return (
            <Card key={`hr-${i}`} className="border-border/70 shadow-none">
              <CardContent className="p-5">
                {s ? (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <s.icon className="h-4 w-4" />
                      </div>
                      <Link
                        to={s.href}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("dashboard.viewAll")} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="mt-5">
                      <div className="text-2xl font-semibold tracking-tight text-foreground">
                        {typeof s.value === "string" ? s.value : s.value.toLocaleString()}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
                    </div>
                    {s.hint ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">{s.hint}</p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-[104px] items-center justify-center">
                    <DverifLoader size="sm" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quota usage card */}
      {analytics?.quota_status && (
        <div className="mt-6">
          <QuotaUsageCard quota={analytics.quota_status} />
        </div>
      )}

      {/* Charts */}
      {analytics && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <OrgHeadcountChart data={analytics.headcount_by_department} />
          </div>
          <div className="lg:col-span-2">
            <OrgAttendanceDonut data={analytics.today_attendance_breakdown} />
          </div>
          <div className="lg:col-span-2">
            <OrgPayrollTrendChart data={analytics.monthly_payroll_trend} />
          </div>
          <div className="lg:col-span-2">
            <OrgLeaveUtilChart data={analytics.leave_utilization} />
          </div>
        </div>
      )}

      {!analytics && analyticsQ.isLoading && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="border-border/70 shadow-none">
              <CardContent className="flex h-[300px] items-center justify-center">
                <DverifLoader size="sm" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Org Admin — HR charts                                               */
/* ------------------------------------------------------------------ */

function QuotaUsageCard({ quota }: { quota: OrgDashboardAnalytics["quota_status"] }) {
  if (!quota) return null;
  const pct = quota.total_allowance > 0
    ? Math.min(100, Math.round((quota.total_requests / quota.total_allowance) * 100))
    : 0;
  const exhausted = quota.total_requests >= quota.total_allowance;

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-foreground">Request Quota Usage</div>
          <Badge variant={exhausted ? "destructive" : "default"} className="text-[11px]">
            {exhausted ? "Exhausted" : `${quota.requests_remaining} left`}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 flex-shrink-0">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" className="stroke-muted" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                className={exhausted ? "stroke-destructive" : "stroke-primary"}
                strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {pct}%
            </div>
          </div>
          <div className="flex-1 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used today</span>
              <span className="font-medium tabular-nums">{quota.total_requests} / {quota.total_allowance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free daily</span>
              <span className="tabular-nums">{quota.free_daily_requests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan quota</span>
              <span className="tabular-nums">{quota.plan_quota}</span>
            </div>
            {quota.plan.name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{quota.plan.name}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgHeadcountChart({ data }: { data: OrgDashboardAnalytics["headcount_by_department"] }) {
  const chartData = data.map((d) => ({
    name: d.department.length > 18 ? d.department.slice(0, 18) + "…" : d.department,
    employees: d.count,
  }));

  return (
    <ChartCard title="Headcount by Department">
      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No department data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="employees" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

function OrgAttendanceDonut({ data }: { data: OrgDashboardAnalytics["today_attendance_breakdown"] }) {
  const chartData = [
    { name: "Present", value: data.present },
    { name: "Late", value: data.late },
    { name: "Absent", value: data.absent },
  ].filter((d) => d.value > 0);

  return (
    <ChartCard title="Today's Attendance">
      <div className="h-[280px] w-full">
        {data.total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No employees yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {chartData.map((_entry, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => {
                  const item = chartData.find((d) => d.name === value);
                  const pct = data.total > 0 ? ((item?.value ?? 0) / data.total * 100).toFixed(0) : "0";
                  return `${value} (${pct}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

function OrgPayrollTrendChart({ data }: { data: OrgDashboardAnalytics["monthly_payroll_trend"] }) {
  const chartData = data.map((d) => ({
    name: formatMonth(d.month),
    cost: Number(d.total),
  }));

  return (
    <ChartCard title="Monthly Payroll Cost (Last 12 Months)">
      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No payroll data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`PKR ${value.toLocaleString()}`, "Payroll"]}
              />
              <Bar dataKey="cost" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

function OrgLeaveUtilChart({ data }: { data: OrgDashboardAnalytics["leave_utilization"] }) {
  const chartData = data.map((d) => ({
    name: d.leave_type,
    days: d.days_used,
  }));

  return (
    <ChartCard title="Leave Utilization by Type (This Year)">
      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No approved leaves this year
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} days`, "Approved"]}
              />
              <Bar dataKey="days" fill={CHART_COLORS.tertiary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-admin — operational widgets (leave pending, today attendance)   */
/* ------------------------------------------------------------------ */
function SubAdminDashboard() {
  const { t } = useTranslation();
  const { isLocked } = useOrgSubscription();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pendingLeaves = useQuery({
    queryKey: ["subadmin-dash-pending-leaves"],
    queryFn: () => orgLeavesService.list({ page: 1, limit: 1, status: "pending" }),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const allLeaves = useQuery({
    queryKey: ["subadmin-dash-all-leaves"],
    queryFn: () => orgLeavesService.list({ page: 1, limit: 1 }),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["org-dashboard-analytics"],
    queryFn: () => dashboardService.orgAnalytics(),
    enabled: mounted,
    retry: false,
    refetchInterval: 60_000,
  });
  const attendance = analyticsQ.data?.today_attendance;
  const presentCount = attendance?.present ?? 0;

  const cards: Stat[] = [
    {
      label: t("dashboardSubAdmin.pendingLeaveRequests"),
      value: pendingLeaves.data?.total ?? 0,
      icon: CalendarClock,
      href: "/org/leaves",
      progress: ratioProgress(pendingLeaves.data?.total, allLeaves.data?.total),
    },
    {
      label: t("dashboardSubAdmin.todayAttendance"),
      value: attendance ? String(presentCount) + " / " + attendance.total : presentCount,
      icon: ClipboardCheck,
      href: "/org/attendance",
      progress: ratioProgress(presentCount, attendance?.total),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("dashboardSubAdmin.title")}
        description={isLocked ? t("dashboard.lockedSub") : t("dashboardSubAdmin.subtitle")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(pendingLeaves.isLoading || allLeaves.isLoading || analyticsQ.isLoading
          ? Array.from({ length: 2 })
          : cards
        ).map((raw, i) => {
          const s = raw as Stat | undefined;
          return (
            <Card
              key={i}
              className={`border-border/70 shadow-none ${isLocked ? "opacity-60" : ""}`}
            >
              <CardContent className="p-5">
                {s ? (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <s.icon className="h-4 w-4" />
                      </div>
                      <Link
                        to={s.href}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("dashboard.viewAll")} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="mt-5">
                      <div className="text-2xl font-semibold tracking-tight text-foreground">
                        {s.value.toLocaleString()}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
                    </div>
                    <Progress value={normalizeProgress(s.progress)} className="mt-4 h-1.5" />
                  </>
                ) : (
                  <div className="flex h-[104px] items-center justify-center">
                    <DverifLoader size="sm" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employee — leave balance, this month's payslip, attendance summary  */
/* ------------------------------------------------------------------ */
function EmployeeDashboard({ firstName }: { firstName: string }) {
  const { t } = useTranslation();
  const { isLocked } = useOrgSubscription();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = new Date();
  const curMonth = String(now.getMonth() + 1);
  const curYear = String(now.getFullYear());

  const balancesQ = useQuery({
    queryKey: ["employee-dash-balances"],
    queryFn: () => leavesService.balance(),
    enabled: mounted,
    retry: false,
  });

  const payslipQ = useQuery({
    queryKey: ["employee-dash-payslip", curMonth, curYear],
    queryFn: () => salaryService.mine({ page: 1, limit: 20, month: curMonth, year: curYear }),
    enabled: mounted,
    retry: false,
  });

  const attendanceQ = useQuery({
    queryKey: ["employee-dash-attendance", curMonth, curYear],
    queryFn: () => attendanceService.history({ page: 1, limit: 100 }),
    enabled: mounted,
    retry: false,
  });

  const balances: LeaveBalance[] = balancesQ.data ?? [];
  const payslips: SalaryRecord[] = payslipQ.data?.items ?? [];
  const payslip =
    payslips.find((r) => String(r.month) === curMonth && String(r.year) === curYear) ?? payslips[0];

  const monthPrefix = `${curYear}-${curMonth.padStart(2, "0")}`;
  const presentDays = (attendanceQ.data?.items ?? []).filter((r) => {
    const d = String(r.date).slice(0, 7);
    return d === monthPrefix && (r.status === "checked_in" || r.status === "checked_out");
  }).length;

  return (
    <div>
      <PageHeader
        title={t("dashboard.welcomeBack") + firstName}
        description={isLocked ? t("dashboard.lockedSub") : t("dashboard.employeeSub")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* This month's payslip */}
        <Card className={`border-border/70 shadow-none ${isLocked ? "opacity-60" : ""}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("dashboard.netSalary")}</p>
            </div>
            {payslipQ.isLoading ? (
              <div className="flex h-12 items-center">
                <DverifLoader size="sm" />
              </div>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  {payslip ? money(payslip.net_salary) : "—"}
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {t("dashboard.payslipPeriod", { period: `${curMonth}/${curYear}` })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My attendance this month */}
        <Card className={`border-border/70 shadow-none ${isLocked ? "opacity-60" : ""}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("dashboard.daysPresent")}</p>
            </div>
            {attendanceQ.isLoading ? (
              <div className="flex h-12 items-center">
                <DverifLoader size="sm" />
              </div>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  {presentDays}
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {t("dashboard.attendancePeriod", { period: `${curMonth}/${curYear}` })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My leave balance */}
        <Card className={`border-border/70 shadow-none ${isLocked ? "opacity-60" : ""}`}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8">
                <Link to="/leaves">
                  {t("dashboard.viewAll")} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            {balancesQ.isLoading ? (
              <div className="flex h-[104px] items-center justify-center">
                <DverifLoader size="sm" />
              </div>
            ) : balances.length === 0 ? (
              <div className="mt-5 text-sm text-muted-foreground">
                {t("dashboard.noLeaveBalance")}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {balances.slice(0, 2).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2"
                  >
                    <span className="text-sm text-muted-foreground">{b.leave_type_name}</span>
                    <Badge variant="outline" className="shrink-0">
                      {b.remaining} {t("dashboard.days")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
