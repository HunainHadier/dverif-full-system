import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  FileText,
  Hash,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";

import { DverifLoader } from "@/components/common/DvarifLoader";
import { Card, CardContent } from "@/components/ui/card";
import { verifyService, type PublicLetterVerification } from "@/services";
import { formatDateTime } from "@/lib/utils";
import logoMark from "@/assets/logo-mark.png";

/**
 * Public HR Letter verification page.
 *
 * This route exists because the backend has always pointed letter QR codes at
 * `/verify/letter/<token>` while the SPA only had `/verify/$qrToken` for
 * documents. The two disagreeing is why a perfectly valid letter QR 404'd.
 *
 * The backend URL is the fixed side of that pair: the QR is already printed on
 * issued letters, so the page follows the code, not the other way round.
 *
 * Fail-closed behaviour comes from the server, not from this page: a revoked,
 * forged, or unknown token all return 404, so a scanner learns nothing about
 * which it was. Do not add a "revoked" state here — that would defeat it.
 */
export const Route = createFileRoute("/verify/letter/$qrToken")({
  head: () => ({
    meta: [
      { title: "Verify Letter — Dverif" },
      {
        name: "description",
        content: "Confirm an HR letter was officially issued by its employer.",
      },
    ],
  }),
  component: VerifyLetterPage,
});

function VerifyLetterPage() {
  const { qrToken } = Route.useParams();

  const result = useQuery({
    queryKey: ["public-verify-letter", qrToken],
    queryFn: () => verifyService.verifyLetter(qrToken),
    // A 404 here is a real answer (revoked/forged/unknown), so do not retry it.
    retry: false,
  });

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <img src={logoMark} alt="Dverif" className="h-8 w-8" />
            <span className="text-lg font-bold text-foreground">Dverif</span>
          </div>
          {/* Same-origin, so this page never names a host of its own. */}
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Dverif
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-2xl">
          {result.isLoading ? (
            <Card className="border-border/70 bg-background shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <DverifLoader size="md" />
                <p className="text-sm text-muted-foreground">Verifying letter…</p>
              </CardContent>
            </Card>
          ) : result.isError || !result.data ? (
            <Card className="border-border/70 bg-background shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Letter not verified</h1>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  This verification link is invalid, has been revoked, or cannot be confirmed. If
                  you believe this is a mistake, contact the organization that issued the letter.
                </p>
              </CardContent>
            </Card>
          ) : (
            <VerifiedLetter data={result.data} />
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background px-3.5 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {value ? (
          <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{value}</p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

function VerifiedLetter({ data }: { data: PublicLetterVerification }) {
  return (
    <Card className="border-border/70 bg-background shadow-none">
      <CardContent className="p-5 sm:p-7">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <BadgeCheck className="h-9 w-9 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Letter verified</h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            This letter was officially issued through Dverif and its authenticity has been confirmed
            by the issuing organization.
          </p>
        </div>

        {/* Single column on a phone; two only once there is room. */}
        <dl className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field icon={User} label="Issued to" value={data.holder_name} />
          <Field icon={Briefcase} label="Designation" value={data.designation} />
          <Field icon={FileText} label="Letter type" value={data.letter_type} />
          <Field icon={Hash} label="Reference" value={data.reference_no} />
          <Field icon={ShieldCheck} label="Issued by" value={data.organization_name} />
          <Field icon={CalendarDays} label="Issued on" value={formatDateTime(data.issued_at)} />
        </dl>

        <div className="mt-6 rounded-lg border border-success/30 bg-success/5 p-3 text-center">
          <p className="text-xs font-medium text-success">Status: VERIFIED</p>
        </div>
      </CardContent>
    </Card>
  );
}
