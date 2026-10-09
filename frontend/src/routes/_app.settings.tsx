import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Camera,
  Save,
  Lock,
  Building2,
  Languages,
  Database,
  FileStack,
  UserCog,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authService } from "@/services";
import { PasswordInput } from "@/components/common/PasswordInput";
import { DocumentTypesPanel } from "@/components/admin/DocumentTypesPanel";
import { DatabaseBackupPanel } from "@/components/admin/DatabaseBackupPanel";
import { authStore, useAuth } from "@/lib/auth";
import { digitsOnly, resolveAssetUrl } from "@/lib/utils";
import { setLanguage, getLanguage } from "@/i18n";

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Settings — Dverif" }] }),
  component: SettingsPage,
});

/** Tabs the system admin gets that an org user never sees. */
const ADMIN_TABS = ["account", "document-types", "database"] as const;

function SettingsPage() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch({ from: "/_app/settings" });

  const isPlatformAdmin = user?.role === "admin";
  // URL-driven so an admin can link straight to a tab. The value is validated
  // against the list, so a hand-edited ?tab= cannot put a non-admin tab on screen.
  const requested = search.tab;
  const initialTab =
    isPlatformAdmin && requested && (ADMIN_TABS as readonly string[]).includes(requested)
      ? requested
      : "account";

  type ProfileData = {
    full_name?: string;
    phone?: string | null;
    profile_image?: string | null;
    email?: string;
    organization_uuid?: string | null;
    organization_name?: string | null;
    organization_logo?: string | null;
  };

  const me = useQuery({
    queryKey: ["me"],
    queryFn: (): Promise<ProfileData> =>
      user?.role === "admin" ? authService.adminMe() : authService.me(),
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const src = me.data;
    if (src) {
      setFullName(src.full_name ?? "");
      setPhone(src.phone ?? "");
      setPreview(src.profile_image ?? null);
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      const saved = me.data;
      if (!saved) throw new Error("Profile is still loading");

      const nextName = fullName.trim();
      if (nextName !== (saved.full_name ?? "")) form.append("full_name", nextName);

      const nextPhone = digitsOnly(phone);
      const savedPhone = digitsOnly(saved.phone ?? "");
      if (nextPhone !== savedPhone) form.append("phone", nextPhone);

      if (image) form.append("profile_image", image);
      if (user?.role === "admin") {
        return authService.updateAdminProfile(form);
      }
      return authService.updateProfile(form);
    },
    onSuccess: (u) => {
      toast.success(t("settings.profileUpdated"));
      setImage(null);
      if (u && user) {
        authStore.updateUser({
          ...user,
          full_name: (u as any).full_name ?? fullName,
          phone: (u as any).phone ?? phone,
          profile_image: (u as any).profile_image ?? user.profile_image,
        });
      }
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("settings.updateFailed")),
  });

  const hasProfileChanges = Boolean(image)
    || (me.data != null && fullName.trim() !== (me.data.full_name ?? ""))
    || (me.data != null && digitsOnly(phone) !== digitsOnly(me.data.phone ?? ""));
  const initials = (fullName || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs defaultValue={initialTab}>
        <TabsList
          className={`mb-4 grid h-auto w-full gap-1 p-1 sm:w-auto ${
            isPlatformAdmin ? "sm:grid-cols-3" : "sm:grid-cols-1"
          }`}
        >
          <TabsTrigger value="account" className="text-sm">
            <UserCog className="mr-1.5 h-4 w-4 shrink-0" />
            Account
          </TabsTrigger>
          {/* System-admin-only tabs. Gated on the role here AND on the route in
              routeAccess.ts, and the endpoints themselves are behind
              authAdminEnv — this is just the UI half. */}
          {isPlatformAdmin && (
            <>
              <TabsTrigger value="document-types" className="text-sm">
                <FileStack className="mr-1.5 h-4 w-4 shrink-0" />
                Document Types
              </TabsTrigger>
              <TabsTrigger value="database" className="text-sm">
                <Database className="mr-1.5 h-4 w-4 shrink-0" />
                Database Backup
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="account">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/70 shadow-none lg:col-span-2">
              <CardContent className="p-6">
                <h2 className="text-sm font-semibold text-foreground">{t("settings.profile")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.profileSubtitle")}</p>

            <div className="mt-6 flex items-center gap-5">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={resolveAssetUrl(preview) ?? undefined} alt={fullName} />
                  <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground">
                  <Camera className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setImage(f);
                      if (f) setPreview(URL.createObjectURL(f));
                    }}
                  />
                </label>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">{fullName || "—"}</div>
                <div className="text-xs text-muted-foreground">{me.data?.email ?? user?.email}</div>
                <div className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                  {user?.role}
                </div>
              </div>
            </div>

            {user?.role !== "admin" && me.data?.organization_name ? (
              <div className="mt-6 flex items-center gap-4 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                <Avatar className="h-16 w-16 shrink-0 rounded-xl border border-border bg-background shadow-sm">
                  <AvatarImage
                    src={resolveAssetUrl(me.data.organization_logo) ?? undefined}
                    alt={`${me.data.organization_name} logo`}
                    className="bg-background p-1 object-contain"
                  />
                  <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-7 w-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("settings.organization")}
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-foreground">
                    {me.data.organization_name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("settings.organizationWorkspace", "Your organization workspace")}
                  </p>
                </div>
              </div>
            ) : null}

            <Separator className="my-6" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.fullName")}</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.email")}</Label>
                <Input value={me.data?.email ?? user?.email ?? ""} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.phone")}</Label>
                <Input value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} />
              </div>

            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !me.data || !hasProfileChanges}>
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? t("settings.saving") : t("settings.saveChanges")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {user?.role !== "admin" ? (
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-foreground">{t("settings.security")}</h2>
              <p className="text-xs text-muted-foreground">{t("settings.securitySubtitleUser")}</p>
              <div className="mt-5">
                <PasswordChangeCard />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-foreground">{t("settings.security")}</h2>
              <p className="text-xs text-muted-foreground">{t("settings.securitySubtitleAdmin")}</p>
              <div className="mt-5">
                <AdminPasswordChangeCard />
              </div>
            </CardContent>
          </Card>
        )}
          </div>

            <div className="mt-6">
              {user?.role !== "admin" && <LanguagePreferenceCard />}
            </div>
          </TabsContent>

        {isPlatformAdmin && (
          <>
            <TabsContent value="document-types">
              <DocumentTypesPanel />
            </TabsContent>
            <TabsContent value="database">
              <DatabaseBackupPanel />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function PasswordChangeCard() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { t } = useTranslation();

  const sendReset = async () => {
    setLoading(true);
    try {
      await authService.forgotPassword(user?.email ?? "");
      setSent(true);
      toast.success(t("settings.resetSent"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("settings.resetSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("settings.resetLinkSentInfo")}
      </div>
    );
  }

  return (
    <Button variant="outline" className="w-full" onClick={sendReset} disabled={loading}>
      <Lock className="mr-2 h-4 w-4" />
      {loading ? t("settings.sending") : t("settings.sendResetLink")}
    </Button>
  );
}

function AdminPasswordChangeCard() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { t } = useTranslation();

  const pwValidations = [
    { label: t("settings.pwValidationMin"), ok: newPassword.length >= 8 },
    { label: t("settings.pwValidationUpper"), ok: /[A-Z]/.test(newPassword) },
    { label: t("settings.pwValidationLower"), ok: /[a-z]/.test(newPassword) },
    { label: t("settings.pwValidationNumber"), ok: /[0-9]/.test(newPassword) },
    { label: t("settings.pwValidationSpecial"), ok: /[^A-Za-z0-9]/.test(newPassword) },
  ];
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const changePw = useMutation({
    mutationFn: () => {
      if (newPassword.length < 8) throw new Error(t("settings.pwValidationMin"));
      if (!/[A-Z]/.test(newPassword)) throw new Error(t("settings.pwValidationUpper"));
      if (!/[a-z]/.test(newPassword)) throw new Error(t("settings.pwValidationLower"));
      if (!/[0-9]/.test(newPassword)) throw new Error(t("settings.pwValidationNumber"));
      if (!/[^A-Za-z0-9]/.test(newPassword)) throw new Error(t("settings.pwValidationSpecial"));
      if (newPassword !== confirmPassword) throw new Error(t("settings.passwordsDontMatch"));
      return authService.updateAdminProfile({
        password: newPassword,
        old_password: oldPassword,
      });
    },
    onSuccess: () => {
      toast.success(t("settings.passwordUpdated"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? e?.message ?? t("settings.passwordUpdateFailed"));
    },
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t("settings.currentPassword")}</Label>
        <PasswordInput
          placeholder="••••••••"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("settings.newPassword")}</Label>
        <PasswordInput
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      {newPassword.length > 0 && (
        <ul className="space-y-1 text-[11px]">
          {pwValidations.map((v) => (
            <li key={v.label} className={v.ok ? "text-emerald-600" : "text-muted-foreground"}>
              {v.ok ? "\u2713" : "\u2022"} {v.label}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Label>{t("settings.confirmNewPassword")}</Label>
        <PasswordInput
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {confirmPassword.length > 0 && (
        <p className={`text-[11px] ${passwordsMatch ? "text-emerald-600" : "text-destructive"}`}>
          {passwordsMatch
            ? `\u2713 ${t("settings.passwordsMatch")}`
            : t("settings.passwordsDontMatch")}
        </p>
      )}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => changePw.mutate()}
        disabled={changePw.isPending || !oldPassword || !newPassword || !passwordsMatch}
      >
        <Lock className="mr-2 h-4 w-4" />
        {changePw.isPending ? t("settings.updating") : t("settings.updatePassword")}
      </Button>
    </div>
  );
}

function LanguagePreferenceCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [value, setValue] = useState<string>(getLanguage());

  const onChange = (next: string) => {
    setValue(next);
    const lang = next as "en" | "ur";
    setLanguage(lang);
    if (!user) return;
    const persist =
      user.role === "admin"
        ? authService.setAdminPreferredLanguage(lang)
        : authService.setPreferredLanguage(lang);
    persist
      .then(() => {
        authStore.updateUser({ ...user, preferred_language: lang });
        toast.success(lang === "ur" ? "زبان اردو کر دی گئی" : "Language set to English");
      })
      .catch(() => {
        // preference still applies locally for this session
      });
  };

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t("lang.language")}</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("lang.preferenceHint")}</p>
        <RadioGroup
          value={value}
          onValueChange={onChange}
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
            <RadioGroupItem value="en" />
            {t("lang.english")}
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
            <RadioGroupItem value="ur" />
            {t("lang.urdu")}
          </label>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
