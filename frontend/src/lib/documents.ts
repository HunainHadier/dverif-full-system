import { api } from "./api";

export type ServedDocType = "requests" | "employees";

/**
 * MIME type per stored-file extension.
 *
 * This is what makes "View" actually view. A Blob built from an axios response
 * inherits whatever Content-Type the server sent, and for these uploads that is
 * typically application/octet-stream. Chrome refuses to render an
 * application/octet-stream blob — it just downloads it — so the View button
 * saved the file instead of showing it. Handing the blob its real type lets the
 * browser's built-in PDF/image viewer render it in the tab.
 */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function mimeForPath(path?: string | null): string {
  const ext =
    String(path || "")
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * MIME types a browser can display natively without downloading.
 *
 * PDF, raster images and plain text all have a built-in viewer, so they keep
 * going to the pre-opened tab (see openStoredDocument) and are deliberately
 * left alone. Everything else has to be rendered by us.
 */
function isNativelyViewable(mime: string): boolean {
  return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/");
}

/**
 * Client-side renderers, keyed by MIME type.
 *
 * A registry rather than a `if (ext === "docx")` branch so that the next
 * format a browser cannot display is added the same way: one entry here, one
 * renderer module, no change to the call sites. The rule for every entry is the
 * same — render in the browser from the authenticated blob, never convert on
 * the server — so adding one cannot quietly reintroduce a server-side
 * HTML-injection path.
 */
const INLINE_RENDERERS: Record<
  string,
  () => Promise<(blob: Blob, container: HTMLElement) => Promise<void>>
> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": () =>
    import("./docxRenderer").then((m) => m.renderDocx),
};

export type InlineRenderKey = "docx";

/**
 * Which client-side renderer, if any, should handle a stored document.
 *
 * Returns null for everything the browser can already display (and for
 * everything that has no renderer yet, which keeps the current download
 * fallback). Detection is by the STORED file's extension, i.e. the same
 * extension the upload allow-list admitted, not by anything the document itself
 * claims about itself.
 */
export function inlineRendererForPath(path?: string | null): InlineRenderKey | null {
  const mime = mimeForPath(path);
  if (!INLINE_RENDERERS[mime]) return null;
  // Native viewers win: never shadow a format that already opens correctly.
  if (isNativelyViewable(mime)) return null;
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ? "docx"
    : null;
}

/** Load the renderer module for a key, resolved lazily. */
export function loadInlineRenderer(key: InlineRenderKey) {
  const loader =
    key === "docx"
      ? INLINE_RENDERERS["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
      : null;
  if (!loader) throw new Error(`No client-side renderer registered for "${key}"`);
  return loader();
}

/**
 * Map a stored document path to the authenticated download route params.
 *  - verification_requests.document_path = "/uploads/documents/<file>"   → "requests"
 *  - employee_documents.file_path       = "documents/<file>"             → "employees"
 * Returns null for any other shape (logos, profile images, malformed paths).
 */
export function documentRouteFromStoredPath(
  path?: string | null,
): { type: ServedDocType; filename: string } | null {
  if (!path) return null;
  const p = String(path).replace(/^\//, "");
  if (!p) return null;

  let type: ServedDocType | null = null;
  if (p.startsWith("uploads/documents/")) type = "requests";
  else if (p.startsWith("documents/")) type = "employees";
  if (!type) return null;

  const prefix = type === "requests" ? "uploads/documents/" : "documents/";
  const filename = p.slice(prefix.length);
  if (!filename || /(^|\/)\/|\.\./.test(filename) || filename.includes("\\")) return null;
  return { type, filename };
}

/** Fetch a stored document Blob using the authenticated axios instance. */
export async function fetchStoredDocument(path?: string | null): Promise<Blob | null> {
  const route = documentRouteFromStoredPath(path);
  if (!route) return null;
  try {
    const res = await api.get(`/documents/${route.type}/${encodeURIComponent(route.filename)}`, {
      responseType: "blob",
    });
    return res.data as Blob;
  } catch {
    return null;
  }
}

/**
 * Open a stored document for viewing.
 *
 * Returns which path was taken, so a caller can tell "shown" from "saved" —
 * the two are very different to a user who clicked View.
 *
 *   "viewed"  — handed to the browser's own viewer in a new tab (PDF, images,
 *               text). Unchanged behaviour.
 *   "rendered" — not natively viewable but a client-side renderer exists, so it
 *               was opened in the in-page preview panel instead of being
 *               downloaded. This is the DOCX case.
 *   "downloaded" — the browser would have saved it and no renderer exists, so
 *               offering the file is the honest outcome rather than a blank tab.
 *   "failed"  — the document could not be fetched at all.
 */
export type OpenOutcome = "viewed" | "rendered" | "downloaded" | "failed";

export async function openStoredDocument(path?: string | null): Promise<OpenOutcome> {
  const route = documentRouteFromStoredPath(path);
  if (!route) return "failed";

  // A format the browser cannot display is handled by the in-page renderer, not
  // by navigating a tab to it. No window is opened: a DOCX is shown where the
  // user is looking rather than in a new tab that would have downloaded it.
  const rendererKey = inlineRendererForPath(path);
  if (rendererKey) {
    try {
      await loadInlineRenderer(rendererKey);
      return "rendered";
    } catch {
      return "failed";
    }
  }

  const win = openViewerWindow();
  const blob = await fetchStoredDocument(path);
  if (!blob) {
    win?.close();
    return "failed";
  }

  const mime = mimeForPath(path);
  if (!isNativelyViewable(mime)) {
    // Not renderable and no client-side renderer — fall back to saving the file
    // instead of showing a blank tab.
    win?.close();
    return triggerBlob(blob, mime, basename(path)) ? "downloaded" : "failed";
  }

  if (!win) {
    // Popup blocked: fall back to a download so the user still gets the file.
    return triggerBlob(blob, mime, basename(path)) ? "downloaded" : "failed";
  }

  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  // Navigate the pre-opened tab directly to the typed Blob. Native browser
  // viewers reliably render PDFs and images; embedding them inside a generated
  // HTML document can leave a blank viewer in some browsers.
  win.location.replace(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  return "viewed";
}

/** Open a blank tab up-front so the later async work is not popup-blocked. */
function openViewerWindow(): Window | null {
  const win = window.open("", "_blank");
  if (win) {
    win.document.title = "Loading…";
    win.document.body?.appendChild(win.document.createTextNode("Loading…"));
  }
  return win;
}

function basename(path?: string | null): string {
  const p = String(path || "");
  return p.split(/[\\/]/).pop() ?? "";
}

/**
 * Download a stored document under its ORIGINAL file name.
 *
 * Stored names are opaque (`doc_<timestamp>_<rand><ext>`) so a user-supplied name
 * can never influence the path on disk; without an explicit download name the
 * browser fell back to that internal name.
 */
export async function downloadStoredDocument(
  path?: string | null,
  fileName?: string | null,
): Promise<boolean> {
  const blob = await fetchStoredDocument(path);
  if (!blob) return false;
  return triggerBlob(blob, mimeForPath(path), fileName);
}

function triggerBlob(blob: Blob, mime: string, fileName?: string | null): boolean {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadName(fileName) || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Reduce an arbitrary stored file_name to something safe for the `download`
 * attribute: strip directory components and characters that would let a name
 * confuse the OS or break out of the downloads folder.
 */
function safeDownloadName(name?: string | null): string {
  if (!name) return "";
  const base = String(name).split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"*/:<>?\\|]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "";
  return cleaned.slice(0, 200);
}
