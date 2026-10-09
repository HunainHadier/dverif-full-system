import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";

import { DverifLoader } from "@/components/common/DvarifLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { verifyService, type PublicVerification } from "@/services";
import { formatDateTime } from "@/lib/utils";
import logoMark from "@/assets/logo-mark.png";

export const Route = createFileRoute("/verify/$qrToken")({
  head: () => ({
    meta: [
      { title: "Verify Document — Dverif" },
      { name: "description", content: "Confirm a document was officially verified on Dverif." },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { qrToken } = Route.useParams();

  const result = useQuery({
    queryKey: ["public-verify", qrToken],
    queryFn: () => verifyService.verify(qrToken),
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
                <p className="text-sm text-muted-foreground">Verifying certificate…</p>
              </CardContent>
            </Card>
          ) : result.isError || !result.data ? (
            <Card className="border-border/70 bg-background shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Certificate not found</h1>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  This verification link is invalid or expired. The certificate it points to could
                  not be confirmed. If you believe this is a mistake, contact the organization that
                  issued it.
                </p>
                <Button asChild variant="outline" className="mt-2">
                  <Link to="/">Go to Dverif</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <VerifiedDocument data={result.data} qrToken={qrToken} />
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-background py-6">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dverif. Secure document verification.
        </p>
      </footer>
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

function VerifiedDocument({ data, qrToken }: { data: PublicVerification; qrToken: string }) {
  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-background shadow-none">
        <CardContent className="p-5 sm:p-7">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <BadgeCheck className="h-9 w-9 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Document verified</h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              The document shown below was officially verified through Dverif and its authenticity
              has been confirmed by the issuing organization.
            </p>
          </div>

          {/* Single column on a phone; two only once there is room. */}
          <dl className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field icon={User} label="Person" value={data.person_name} />
            <Field icon={Fingerprint} label="CNIC" value={data.cnic_masked} />
            <Field icon={FileText} label="Document type" value={data.document_type} />
            <Field icon={ShieldCheck} label="Issued by" value={data.organization_name} />
            <Field
              icon={CalendarDays}
              label="Verified on"
              value={data.verification_date ? formatDateTime(data.verification_date) : null}
            />
          </dl>

          <div className="mt-6 rounded-lg border border-success/30 bg-success/5 p-3 text-center">
            <p className="text-xs font-medium text-success">Status: VERIFIED</p>
          </div>
        </CardContent>
      </Card>

      {data.document_available ? (
        <DocumentCard data={data} qrToken={qrToken} />
      ) : null}
    </div>
  );
}

/** Verified PDF and document download links. */
function DocumentCard({ data, qrToken }: { data: PublicVerification; qrToken: string }) {
  const url = verifyService.documentUrl(qrToken);
  const fileName = `${data.certificate_code || "certificate"}-${data.document_type || "document"}`
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .concat(fileExtensionFor(data.file_type));

  return (
    <Card className="border-border/70 bg-background shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-success" />
          <h2 className="text-sm font-semibold text-foreground">Verified document</h2>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </a>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <a href={url} download={fileName} rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Download
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function fileExtensionFor(fileType: PublicVerification["file_type"]): string {
  if (fileType === "pdf") return ".pdf";
  if (fileType === "docx") return ".docx";
  if (fileType === "image") return "";
  return "";
}
