import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadStoredDocument,
  fetchStoredDocument,
  inlineRendererForPath,
  loadInlineRenderer,
  type InlineRenderKey,
} from "@/lib/documents";

/**
 * In-page preview for document formats a browser cannot display on its own.
 *
 * A DOCX is the case this exists for: navigating to one downloads it, so a
 * View click on a request or an employee reference silently saved the file
 * instead of showing it. Here the file is fetched through the same
 * authenticated route every other document uses, and rendered into a DOM
 * container by a client-side layout engine.
 *
 * SECURITY POSTURE
 * The blob is never converted to an HTML string and never assigned to
 * innerHTML — not here, and not inside the renderer (see lib/docxRenderer.ts
 * for the audit of the installed library's output path). The renderer builds
 * real DOM nodes, so text from an untrusted document can only ever become a
 * text node. Nothing is written to disk on the server and no HTML file is ever
 * produced, so the server's per-organization ownership checks are untouched.
 *
 * FAILURE
 * A corrupt or truncated package, an unsupported variant, or a missing network
 * all resolve to the same visible state: a plain explanation plus a download
 * button. An empty panel would be indistinguishable from a document that is
 * genuinely blank, which is the one thing a reviewer must never be unsure about.
 */
export function DocumentPreviewDialog({
  open,
  onOpenChange,
  storedPath,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storedPath?: string | null;
  fileName?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const rendererKey: InlineRenderKey | null = inlineRendererForPath(storedPath);
  const title = fileName?.trim() || storedPath?.split(/[\\/]/).pop() || "Document";

  useEffect(() => {
    if (!open || !storedPath || !rendererKey) {
      setStatus("idle");
      setReason(null);
      return;
    }

    // Guards a late render landing in a panel the user already closed, or in a
    // panel that has since been pointed at a different document.
    let cancelled = false;
    setStatus("loading");
    setReason(null);

    (async () => {
      try {
        const blob = await fetchStoredDocument(storedPath);
        if (cancelled) return;
        if (!blob) {
          setStatus("error");
          setReason(
            "The file could not be loaded. It may have been removed, or you may not have access.",
          );
          return;
        }

        // Wait for the dialog to be mounted so the container exists and is
        // measurable — docx-preview needs a real element to lay out into.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) {
          setStatus("error");
          setReason("The preview panel could not be prepared.");
          return;
        }

        const render = await loadInlineRenderer(rendererKey);
        if (cancelled) return;

        // The library clears the container itself before rendering.
        await render(blob, container);
        if (cancelled) return;

        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        console.warn("[DocumentPreview] render failed", e);
        setStatus("error");
        setReason(
          "This file could not be read as a Word document. It may be corrupt, or saved in an older format.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, storedPath, rendererKey]);

  const handleDownload = useCallback(async () => {
    if (!storedPath || downloading) return;
    setDownloading(true);
    try {
      const ok = await downloadStoredDocument(storedPath, fileName);
      if (!ok) {
        toast.error("Could not download the document. Check access and try again.");
      }
    } finally {
      setDownloading(false);
    }
  }, [storedPath, fileName, downloading]);

  if (!rendererKey) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-3 sm:max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate" title={title}>
            {title}
          </DialogTitle>
          <DialogDescription>
            Previewed in your browser. The original file is unchanged.
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>Loading preview…</span>
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center"
          >
            <FileWarning className="h-8 w-8 text-destructive" aria-hidden />
            <p className="max-w-md text-sm font-medium">Couldn&apos;t preview this file</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {reason ?? "The document could not be rendered in the browser."} You can download it
              and open it in Word instead.
            </p>
            <Button type="button" variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-2 h-4 w-4" aria-hidden />
              )}
              Download instead
            </Button>
          </div>
        )}

        {/*
          The render target. Nothing from the document is ever written here as
          markup — docx-preview appends element and text nodes to this element.

          It is deliberately NEVER `display:none`. docx-preview measures the
          container to work out page width and scale, and a hidden element has
          no dimensions, so rendering into one produces a document laid out for
          a 0px-wide page. The element is therefore always present and
          measurable; only its chrome (border, padding, background) is withheld
          until there is something in it, so there is no empty box on screen
          while loading or after a failure.
        */}
        <div
          className={
            // Padding is unconditional so the width docx-preview measures at
            // render time is the width it will still occupy once the content
            // lands; only the visible chrome is withheld until then.
            status === "ready"
              ? "docx-preview-surface min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 p-2"
              : "min-h-0 flex-1 overflow-auto p-2"
          }
        >
          <div ref={containerRef} />
        </div>

        {status === "ready" && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Layout is approximate. Check the original in Word before relying on it.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
