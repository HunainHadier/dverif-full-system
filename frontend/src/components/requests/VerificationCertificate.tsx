import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { BadgeCheck, Check, Copy, Download, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requestsService, isVerifiedRequestStatus, type VerificationRequest } from "@/services";

/**
 * The on-screen verification certificate.
 *
 * Every link and every QR image here comes from `request.verify_url`, which the
 * backend builds with the same helper that stamps the downloadable PDF. The
 * client deliberately constructs nothing from a base URL: a second copy of that
 * string is exactly how the printed certificate and this screen came to point
 * at two different hosts for the same token, and it could not be fixed without
 * editing source. Changing QR_VERIFY_BASE_URL and restarting the backend moves
 * the QR, the link and the PDF together.
 */
export function VerificationCertificate({ request }: { request: VerificationRequest }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const verifyUrl = request.verify_url;
  // Both terminal-success statuses. An auto-verified request carries a token and
// a signature exactly like a manually verified one, so gating on 'verified'
// alone would hide the QR code and the certificate download from the very
// requester whose result it exists to prove.
const isVerified = isVerifiedRequestStatus(request.status);

  useEffect(() => {
    let cancelled = false;
    if (isVerified && verifyUrl) {
      QRCode.toDataURL(verifyUrl, {
        width: 220,
        margin: 1,
        color: { dark: "#0f172a" },
      })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null);
        });
    } else {
      setQrDataUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [isVerified, verifyUrl]);

  // No URL means there is nothing to show: an unverified request, or a verified
  // one minted before the backend could build links.
  if (!isVerified || !verifyUrl) return null;

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await requestsService.downloadCertificate(request.uuid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Dverif-verification-certificate.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Certificate download failed");
    } finally {
      setDownloading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some in-app browsers; the link is on screen and
      // selectable, so a failure here is not worth interrupting the user for.
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
        <BadgeCheck className="h-4 w-4" /> Verification certificate
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-md border border-border bg-white p-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Verification QR code" className="h-40 w-40" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center text-muted-foreground">
              <QrCode className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Scan this QR code or open the link below to confirm the document was officially verified
            on Dverif. The code is tamper-evident and cannot be forged for a fake record.
          </p>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-medium uppercase text-muted-foreground">
                Verify link
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1 rounded px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Copy verify link"
                title="Copy link"
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="break-all text-xs font-medium text-foreground">{verifyUrl}</div>
          </div>
          <Button onClick={download} disabled={downloading} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Preparing…" : "Download Certificate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
