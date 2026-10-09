import { useCallback, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import {
  downloadStoredDocument,
  inlineRendererForPath,
  openStoredDocument,
  type OpenOutcome,
} from "@/lib/documents";
import { DocumentPreviewDialog } from "@/components/common/DocumentPreviewDialog";

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

/**
 * Anchor that opens an uploaded document through the authenticated download
 * API instead of the (now removed) public /uploads static mount. Preserves the
 * markup/classes of a plain <a> so it works as a Button asChild child too.
 *
 * Both modes go through axios: the API is Bearer-token authenticated, so a plain
 * <a href> navigation would be unauthenticated.
 *
 *   mode="view"     — PDF/image/text: rendered by the browser's own viewer in a
 *                     new tab. Unchanged.
 *                   — DOCX: opened in the in-page preview panel, because a
 *                     browser cannot display one and navigating to it would
 *                     download the file. The same authenticated fetch feeds the
 *                     client-side renderer; nothing is converted server-side.
 *   mode="download" saves it under fileName — the name the user uploaded it as
 *
 * This is the single place document viewing is decided, so a format that cannot
 * be displayed natively is handled once here for every caller: the request
 * review modal, request detail, the inbox, the employee documents list, the
 * matched-reference link, and the admin screens.
 */
export function ProtectedDocumentLink({
  storedPath,
  fileName,
  mode = "view",
  onError,
  children,
  ...rest
}: Omit<AnchorProps, "href" | "onClick" | "target" | "rel" | "download"> & {
  storedPath?: string | null;
  fileName?: string | null;
  mode?: "view" | "download";
  onError?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Null means "not a format we render in-page". Kept as the raw path so the
  // dialog can fetch the file itself when it opens.
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (!storedPath || busy) return;

      // A DOCX (or any future registered non-native type) is shown in the
      // preview panel. No navigation, no download, no new tab: the whole point
      // is that the user asked to look at the file, not to save it.
      if (mode === "view" && inlineRendererForPath(storedPath)) {
        setPreviewPath(storedPath);
        return;
      }

      setBusy(true);
      try {
        if (mode === "download") {
          const ok = await downloadStoredDocument(storedPath, fileName);
          if (!ok) {
            if (onError) onError();
            else toast.error("Could not download the document. Check access and try again.");
          }
          return;
        }

        const outcome: OpenOutcome = await openStoredDocument(storedPath);
        if (outcome === "failed") {
          if (onError) onError();
          else toast.error("Could not open the document. Check access or try downloading it.");
        }
      } finally {
        setBusy(false);
      }
    },
    [storedPath, fileName, mode, busy, onError],
  );

  // A registered renderer always reports a non-null key, so the dialog's own
  // guard and this one agree.
  const canPreviewInline = mode === "view" && Boolean(inlineRendererForPath(previewPath));

  return (
    <>
      <a
        {...rest}
        href={storedPath ?? "#"}
        target={mode === "view" ? "_blank" : undefined}
        rel={mode === "view" ? "noreferrer" : undefined}
        aria-disabled={busy}
        onClick={handleClick}
      >
        {children}
      </a>

      {canPreviewInline && (
        <DocumentPreviewDialog
          open={previewPath !== null}
          onOpenChange={(next) => {
            if (!next) setPreviewPath(null);
          }}
          storedPath={previewPath}
          fileName={fileName}
        />
      )}
    </>
  );
}
