import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import logoFull from "@/assets/logo-full.png";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Label } from "@/components/ui/label";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { authService } from "@/services";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/system-admin/reset-password")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const { token: sessionToken, user } = authStore.get();
      if (sessionToken && user) throw redirect({ to: "/dashboard" });
      const token = new URL(window.location.href).searchParams.get("token");
      if (!token) throw redirect({ to: "/system-admin/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "System Admin Reset Password — Dverif" },
      { name: "description", content: "Choose a new password for your administrator account." },
    ],
  }),
  component: AdminResetPasswordPage,
});

function AdminResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!/[A-Z]/.test(pw)) return toast.error("Password must contain at least one uppercase letter");
    if (!/[a-z]/.test(pw)) return toast.error("Password must contain at least one lowercase letter");
    if (!/[0-9]/.test(pw)) return toast.error("Password must contain at least one number");
    if (!/[^A-Za-z0-9]/.test(pw)) return toast.error("Password must contain at least one special character");
    if (pw !== confirm) return toast.error("Passwords do not match");
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") ?? "";
    if (!token) return toast.error("Missing or invalid reset token");
    setLoading(true);
    try {
      await authService.adminResetPassword(token, pw);
      toast.success("Password updated. Please sign in.");
      router.navigate({ to: "/system-admin/login" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Reset failed");
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a strong password for your system administrator account.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <PasswordInput id="pw" required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpw">Confirm password</Label>
              <PasswordInput id="cpw" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <DverifLoader size="xs" className="mr-2" /> Updating…
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
          <Link
            to="/system-admin/login"
            className="mt-6 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to admin sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
