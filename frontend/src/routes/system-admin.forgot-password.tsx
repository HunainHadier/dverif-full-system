import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

import logoFull from "@/assets/logo-full.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { authService } from "@/services";
import { useTranslation } from "react-i18next";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/system-admin/forgot-password")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const { token, user } = authStore.get();
      if (token && user) throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "System Admin Forgot Password — Dverif" },
      { name: "description", content: "Reset your system administrator password." },
    ],
  }),
  component: AdminForgotPasswordPage,
});

function AdminForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.adminForgotPassword(email);
      setSent(true);
      toast.success(t("auth.adminResetSent"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("auth.adminResetSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img
            src={logoFull}
            alt="Dverif"
            className="h-12 w-auto object-contain dark:invert dark:brightness-0"
          />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-lg font-semibold text-foreground">{t("auth.checkInbox")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("auth.adminResetSentBody")}{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link to="/system-admin/login">{t("auth.backToAdminSignIn")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  {t("auth.adminForgotTitle")}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.adminForgotSubtitle")}</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">{t("auth.adminEmail")}</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourdomain.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <DverifLoader size="xs" className="mr-2" /> {t("auth.sending")}
                    </>
                  ) : (
                    t("auth.sendResetLink")
                  )}
                </Button>
              </form>
              <Link
                to="/system-admin/login"
                className="mt-6 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.backToAdminSignIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
