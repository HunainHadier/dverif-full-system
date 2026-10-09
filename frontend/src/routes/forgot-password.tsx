import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";

import logoFull from "@/assets/logo-full.png";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const { token, user } = authStore.get();
      if (token && user) throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Forgot password — Dverif" },
      { name: "description", content: "Reset access to your Dverif workspace." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Could not send reset email";
      if (err?.response?.status === 404) {
        setErrorMsg(msg);
        setLocked(true);
      } else {
        toast.error(msg);
      }
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
              <h1 className="mt-4 text-lg font-semibold text-foreground">Check your inbox</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="font-medium text-foreground">{email}</span>. It expires in 30 minutes.
              </p>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Forgot your password?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the email associated with your account and we'll send you a reset link.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (locked) {
                        setLocked(false);
                        setErrorMsg(null);
                      }
                    }}
                    placeholder="you@company.com"
                  />
                  {errorMsg ? (
                    <p className="text-sm text-destructive">{errorMsg}</p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={loading || locked}>
                  {loading ? (
                    <>
                      <DverifLoader size="xs" className="mr-2" /> Sending…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </form>
              <Link
                to="/login"
                className="mt-6 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
