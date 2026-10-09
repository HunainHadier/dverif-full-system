import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { DverifLoader } from "@/components/common/DvarifLoader";

import logoFull from "@/assets/logo-full.png";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/set-password")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const { token, user } = authStore.get();
      if (token && user) throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Set your password — Dverif" },
      { name: "description", content: "Set your password to activate your Dverif account." },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);

  const token =
    typeof window !== "undefined"
      ? new URL(window.location.href).searchParams.get("token") ?? ""
      : "";

  useEffect(() => {
    if (!token) {
      setInvalidReason("missing");
      setChecking(false);
      return;
    }
    let cancelled = false;
    authService
      .validateInvite(token)
      .then((res) => {
        if (!cancelled && !res?.valid) setInvalidReason(res?.reason ?? "not_found");
      })
      .catch(() => {
        if (!cancelled) setInvalidReason("not_found");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!/[A-Z]/.test(pw)) return toast.error("Password must contain at least one uppercase letter");
    if (!/[a-z]/.test(pw)) return toast.error("Password must contain at least one lowercase letter");
    if (!/[0-9]/.test(pw)) return toast.error("Password must contain at least one number");
    if (!/[^A-Za-z0-9]/.test(pw)) return toast.error("Password must contain at least one special character");
    if (pw !== confirm) return toast.error("Passwords do not match");
    if (!token) return toast.error("Missing or invalid invite link");
    setLoading(true);
    try {
      await authService.setPassword(token, pw);
      setDone(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <DverifLoader size="md" />
          <p className="text-sm text-muted-foreground">Checking your invitation…</p>
        </div>
      </div>
    );
  }

  if (invalidReason) {
    const messages: Record<string, string> = {
      missing: "This link is missing its invitation token.",
      not_found: "This invitation link is invalid or has been cancelled by an administrator.",
      used: "This invitation has already been used. Try signing in instead.",
      expired: "This invitation link has expired. Ask your administrator to resend it.",
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
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Invitation not available
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {messages[invalidReason] ?? messages.not_found}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex justify-center">
            <img
              src={logoFull}
              alt="Dverif"
              className="h-12 w-auto object-contain dark:invert dark:brightness-0"
            />
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Password set!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is now active. You can sign in with your new password.
            </p>
            <Button className="mt-6 w-full" onClick={() => router.navigate({ to: "/login" })}>
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Set your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a strong password to activate your account.
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
                  <DverifLoader size="xs" className="mr-2" /> Setting password…
                </>
              ) : (
                "Set password"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
