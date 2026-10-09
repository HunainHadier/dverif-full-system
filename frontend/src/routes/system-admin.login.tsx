import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ArrowLeft, Mail } from "lucide-react";

import logoFull from "@/assets/logo-full.png";
import adminLoginBg from "@/assets/admin-login.png";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { authStore, type AuthUser } from "@/lib/auth";
import { setLanguage } from "@/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/system-admin/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Only bounce an already-authenticated admin to the dashboard. A regular
    // org/user session (or a stale token left behind by a logout race) must
    // NOT send the system admin away from their login page.
    const token = authStore.get().token;
    const user = authStore.get().user;
    if (token && user?.role === "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "System Admin Sign In — Dverif" },
      { name: "description", content: "Restricted system administrator access." },
    ],
  }),
  component: SystemAdminLoginPage,
});

function SystemAdminLoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [otpPending, setOtpPending] = useState(false);
  const [otpIdentityId, setOtpIdentityId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpRememberMe, setOtpRememberMe] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authService.adminLogin({ email, password, rememberMe });

      if (res?.requiresOtp && res.identity_id) {
        setOtpIdentityId(res.identity_id ?? "");
        setOtpEmail(res.email || email);
        setOtpRememberMe(res.rememberMe ?? rememberMe);
        setOtpPending(true);
        return;
      }

      toast.error(t("auth.adminInvalidCredentials"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("auth.adminInvalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpBack = () => {
    setOtpPending(false);
    setPassword("");
  };

  if (otpPending) {
    return (
      <AdminOtpScreen
        identityId={otpIdentityId}
        email={otpEmail}
        rememberMe={otpRememberMe}
        onBack={handleOtpBack}
      />
    );
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex justify-center lg:justify-start">
            <img
              src={logoFull}
              alt="Dverif — Document Verification Platform"
              className="h-14 w-auto object-contain dark:invert dark:brightness-0 dark:contrast-100"
            />
          </div>

          <div className="mb-8 text-center lg:text-left">
            <div className="mb-4 inline-flex items-center gap-3">
              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t("auth.adminTitle")}
              </h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.adminSubtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-email">{t("auth.adminEmail")}</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-password">{t("auth.password")}</Label>
                <Link
                  to="/system-admin/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <PasswordInput
                id="admin-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(Boolean(v))} />
              {t("auth.keepSignedIn")}
            </label>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <DverifLoader size="xs" className="mr-2" /> {t("auth.signingIn")}
                </>
              ) : (
                t("auth.signIn")
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Marketing column */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-background lg:flex">
        <img
          src={adminLoginBg}
          alt=""
          className="max-h-[45vh] w-auto max-w-full object-contain"
        />
      </div>
    </div>
  );
}

/* ───────── Admin OTP Screen ───────── */
function AdminOtpScreen({
  identityId,
  email,
  rememberMe,
  onBack,
}: {
  identityId: string;
  email: string;
  rememberMe: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newOtp = [...otp];
      newOtp[index] = value.slice(-1);
      setOtp(newOtp);
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [otp],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !otp[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [otp],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!pasted) return;
      const newOtp = [...otp];
      for (let i = 0; i < pasted.length; i++) {
        newOtp[i] = pasted[i];
      }
      setOtp(newOtp);
      const nextEmpty = newOtp.findIndex((v) => !v);
      inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
    },
    [otp],
  );

  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      toast.error(t("auth.completeCodeError"));
      return;
    }
    setLoading(true);
    try {
      const res = await authService.adminVerifyOtp({ identity_id: identityId, otp: code, rememberMe });
      if (!res?.token || !res?.admin) throw new Error(t("auth.invalidResponse"));
      const admin = res.admin;
      const user: AuthUser = {
        uuid: admin.uuid,
        full_name: admin.full_name,
        email: admin.email,
        profile_image: admin.profile_image ?? null,
        role: "admin",
        preferred_language: admin.preferred_language ?? "en",
      };
      authStore.setSession(res.token, user);
      if (user.preferred_language) setLanguage(user.preferred_language);
      toast.success(t("auth.welcomeBackToPlatform"));
      router.navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.message ?? t("auth.invalidCode"));
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await authService.adminResendOtp({ identity_id: identityId });
      setResendCooldown(60);
      toast.success(t("auth.newCodeSent"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("auth.resendFailed"));
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") verifyOtp();
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex justify-center lg:justify-start">
            <img
              src={logoFull}
              alt="Dverif — Document Verification Platform"
              className="h-14 w-auto object-contain dark:invert dark:brightness-0 dark:contrast-100"
            />
          </div>

          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("auth.backToSignIn")}
          </button>

          <div className="mb-8 text-center lg:text-left">
            <div className="mb-4 inline-flex items-center justify-center rounded-full bg-primary/10 p-3">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("auth.enterCode")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("auth.codeSentTo")} <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex justify-center gap-2 sm:gap-3">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => {
                    handleKeyDown(i, e);
                    handleOtpKeyDown(e);
                  }}
                  onPaste={handlePaste}
                  className="h-12 w-12 text-center text-xl font-semibold rounded-lg border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors sm:h-14 sm:w-14 sm:text-2xl"
                />
              ))}
            </div>

            <Button
              onClick={verifyOtp}
              className="w-full"
              disabled={loading || otp.join("").length !== 6}
            >
              {loading ? (
                <>
                  <DverifLoader size="xs" className="mr-2" /> {t("auth.verifying")}
                </>
              ) : (
                t("auth.verifyCode")
              )}
            </Button>

            <div className="text-center">
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {resendCooldown > 0
                  ? t("auth.resendCodeIn", { seconds: resendCooldown })
                  : t("auth.resendCode")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-background lg:flex">
        <img
          src={adminLoginBg}
          alt=""
          className="max-h-[45vh] w-auto max-w-full object-contain"
        />
      </div>
    </div>
  );
}
