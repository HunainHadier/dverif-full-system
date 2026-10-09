import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Eye, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils";
import { saveBlob, useAttachmentUrl } from "@/lib/useAttachmentUrl";
import { assetsService, type AssetAttachment } from "@/services";

/**
 * One attachment, as a card rather than a line of text.
 *
 * A bare filename is close to useless for a purchase receipt: the whole point of
 * keeping one is to check a price or a warranty, and you cannot check anything
 * from a filename. So this offers the three things that make the file usable -
 * look at it, download it, remove it - and shows what kind of file it is without
 * opening anything.
 *
 * EVERY BYTE IS FETCHED THROUGH AXIOS. The endpoint is authenticated, so an <img>
 * or <a> pointed straight at it renders a 401 as the image. That is also why the
 * object URL is revoked on unmount; see useAttachmentUrl.
 */

/** True for the mime types a browser can show inline, as opposed to download. */
function isImage(mime: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith("image/");
}

function isPdf(mime: string | null): boolean {
  return mime === "application/pdf";
}

/**
 * The two network operations a card needs, injectable.
 *
 * DEFAULTED TO THE ASSETS ENDPOINTS, and that default is why this component can be
 * reused instead of forked. Expense receipts live in the SAME `attachments` table
 * (entity_type='expense_claim') but behind different routes — `/org/expense-
 * attachments/:uuid`, not `/org/asset-attachments/:uuid` — because the server's
 * removeReceipt refuses any attachment whose entity_type is not an expense claim,
 * and vice versa in assets.service.js. So a card cannot guess which endpoints to
 * call, and the caller says.
 *
 * Everything that was actually hard here — lazy byte loading, the preview dialog,
 * the confirm-before-delete that fires the API call from onConfirm rather than
 * from the button, the blob reuse for download — stays in one place. The failure
 * this shape prevents is a second card that reimplements deletion without the
 * confirmation, which is how a receipt gets destroyed by a stray click.
 */
export type AttachmentCardHandlers = {
  download: (attachmentUuid: string) => Promise<Blob>;
  remove: (attachmentUuid: string) => Promise<unknown>;
};

const ASSET_ATTACHMENT_HANDLERS: AttachmentCardHandlers = {
  download: (uuid) => assetsService.downloadAttachment(uuid),
  remove: (uuid) => assetsService.removeAttachment(uuid),
};

export function AttachmentCard({
  attachment,
  onDeleted,
  handlers = ASSET_ATTACHMENT_HANDLERS,
}: {
  attachment: AssetAttachment;
  onDeleted: () => void;
  /** Omit for asset attachments; expense receipts pass the expense service. */
  handlers?: AttachmentCardHandlers;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Deletion is confirmed, not immediate. The button only OPENS the dialog; the
  // API call lives in handleDelete below, which the dialog's onConfirm invokes.
  // Firing it from the button made a stray click destroy a purchase receipt -
  // the one file in this drawer that cannot be re-created from data.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "view" | "download" | "delete">(null);

  const image = isImage(attachment.mime_type);
  const pdf = isPdf(attachment.mime_type);

  // Load the bytes on hover OR once a preview is open. Never on mount: a drawer
  // of twenty receipts would otherwise fire twenty authenticated requests the
  // moment it opened.
  const {
    url,
    blob: loadedBlob,
    isLoading,
  } = useAttachmentUrl(hovered || previewOpen, () => handlers.download(attachment.uuid));

  const handleDownload = async () => {
    setBusy("download");
    setDownloadError(null);
    try {
      // Reuse the bytes already fetched for the preview when they exist. The
      // object URL is for DISPLAY only — re-fetching from a blob: URL is not
      // reliably supported, so depending on it would make Download silently fail
      // on exactly the cards the user has already opened.
      const blob = loadedBlob ?? (await handlers.download(attachment.uuid));
      saveBlob(blob, attachment.file_name);
    } catch {
      // A blocked or failed download used to vanish without a trace: no toast, no
      // state change, the button simply stopped spinning. With cards that preview
      // in an <iframe>, "I clicked Download and nothing happened" is the single
      // most reported symptom for this component.
      setDownloadError(t("assets.attachmentDownloadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy("delete");
    setDeleteError(null);
    try {
      await handlers.remove(attachment.uuid);
      // Close only on success. A failed delete that closed the dialog would look
      // exactly like one that worked, and the row would still be sitting there.
      setConfirmOpen(false);
      onDeleted();
    } catch {
      // Surfaced in the dialog rather than swallowed. Axios renders a rejection as
      // "Request failed with status code 500", which names no file and explains
      // nothing.
      setDeleteError(t("assets.attachmentDeleteFailed"));
      // Re-thrown deliberately. ConfirmDialog closes itself when the action
      // RESOLVES and stays open when it rejects, so swallowing this would close the
      // dialog and discard the message set a line above.
      throw new Error("attachment delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
      // Hovering arms the preview fetch. Kept as a plain handler rather than a
      // CSS-only affordance so it also fires for keyboard focus.
      onMouseEnter={() => setHovered(true)}
      onFocus={() => setHovered(true)}
    >
      {/* Thumbnail for images, a type badge otherwise. The badge is shown
          immediately with no network call; the thumbnail replaces it once the
          bytes arrive. */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {image && url ? (
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
            // The filename is already in an adjacent button, so this decorative
            // image does not need a name a screen reader would read twice.
          />
        ) : image && isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : image ? (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!image && !pdf}
          className="block max-w-full truncate text-left text-sm font-medium underline-offset-2 hover:underline disabled:cursor-default disabled:no-underline"
          title={image || pdf ? t("assets.attachmentView") : t("assets.attachmentNoPreview")}
        >
          {attachment.file_name}
        </button>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(attachment.file_size)}
          {attachment.mime_type ? ` · ${attachment.mime_type}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {image || pdf ? (
          <Button
            variant="ghost"
            size="icon"
            title={t("assets.attachmentView")}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          title={t("assets.attachmentDownload")}
          disabled={busy !== null}
          onClick={() => void handleDownload()}
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={t("assets.attachmentDelete")}
          disabled={busy !== null}
          // Opens the confirmation only. handleDelete is reached solely through
          // the dialog's onConfirm, so there is no path from this click to the API.
          onClick={() => setConfirmOpen(true)}
        >
          {busy === "delete" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {downloadError ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {downloadError}
        </p>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{attachment.file_name}</DialogTitle>
            <DialogDescription>{t("assets.attachmentPreviewHint")}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30">
            {isLoading && !url ? (
              <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loading")}
              </p>
            ) : image && url ? (
              <img src={url} alt={attachment.file_name} className="mx-auto max-w-full" />
            ) : pdf && url ? (
              // A blob URL in an iframe renders the PDF in the browser's own
              // viewer with no plugin and no third-party script.
              <iframe src={url} title={attachment.file_name} className="h-[70vh] w-full" />
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {t("assets.attachmentNoPreview")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Rendered outside the card's own <div> because AlertDialog portals itself,
        and nesting it inside the hover-armed subtree would be fine visually but
        muddles which layer owns the confirmation.

        destructive, so the confirm button is styled as a removal rather than a
        save: this is the one action here that cannot be undone.
      */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(v) => {
          setConfirmOpen(v);
          if (!v) setDeleteError(null);
        }}
        title={t("assets.attachmentDeleteTitle")}
        description={t("assets.attachmentDeleteConfirm")}
        confirmLabel={t("assets.attachmentDelete")}
        destructive
        loading={busy === "delete"}
        error={deleteError}
        // Returns the promise rather than `void handleDelete()`. ConfirmDialog
        // closes itself when the action RESOLVES and stays open when it rejects,
        // so discarding it with `void` made every failure look like a success -
        // the dialog vanished and the error was set on a component that was no
        // longer on screen.
        onConfirm={() => handleDelete()}
      />
    </div>
  );
}
