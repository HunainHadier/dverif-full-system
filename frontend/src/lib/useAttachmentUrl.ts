import { useEffect, useState } from "react";

/**
 * Resolve an attachment to a browser-usable object URL, on demand.
 *
 * WHY THIS IS A HOOK AND NOT AN <img src="/org/..."> TAG.
 *
 *  1. THE URL IS AUTHENTICATED. Attachments are served behind the org's session,
 *     so a plain src gets a 401 page rendered as the image. The bytes have to be
 *     fetched through axios and turned into a Blob URL.
 *
 *  2. NONE OF IT SHOULD LOAD EAGERLY. A drawer with twenty receipts would fire
 *     twenty authenticated requests the moment it opened, to display thumbnails
 *     nobody may look at. Callers pass `enabled`, so the fetch starts on hover or
 *     when the card scrolls into view, not on mount.
 *
 *  3. THE OBJECT URL MUST BE REVOKED. Every createObjectURL pins the underlying
 *     Blob in memory for the life of the document, and this app opens drawers
 *     repeatedly. A leak here is a slow tab-wide memory climb that looks like
 *     nothing at all. Cleanup covers unmount AND a changed uuid, so switching
 *     assets cannot leave the previous file resident.
 *
 * A late response for a superseded request is discarded rather than turned into
 * a URL nobody will ever revoke.
 */
export function useAttachmentUrl(enabled: boolean, fetcher: () => Promise<Blob>) {
  const [url, setUrl] = useState<string | null>(null);
  // The Blob is kept alongside its object URL. Download needs the bytes, and
  // re-fetching them from the object URL is wrong twice over: a blob: URL is not
  // reliably fetchable, and it costs a second round trip for a file the user is
  // already looking at. The Blob is the value; the URL is only a way to display it.
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Fetcher identity changes every render for an inline arrow, so it is
    // intentionally not a dependency: `enabled` is the trigger, and the caller is
    // responsible for passing a fetcher bound to the right attachment. Keying the
    // effect on the attachment uuid would be the alternative; the component that
    // uses this remounts per attachment instead.
    if (!enabled || url) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setBlob(result);
        setUrl(URL.createObjectURL(result));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error("Attachment request failed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      // Mark superseded so a response already in flight cannot install a URL that
      // nothing will ever revoke.
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  // Revoke on unmount. Separate from the effect above so it also fires when the
  // component disappears with a URL already resolved.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return { url, blob, isLoading, error };
}

/**
 * Trigger a browser download for a Blob, without leaking the object URL.
 *
 * The anchor is appended, clicked and removed synchronously. Revoking
 * immediately - rather than on a timer - is safe because the download has
 * already been handed to the browser by the time click() returns.
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    // Deliberately NOT wrapped: click() throws when the browser blocks the
    // download (popup blocker, sandboxed iframe, lost user activation), and the
    // caller is the only one that can tell the user about it. Swallowing it here
    // is what made a blocked download fail with no message and no trace.
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
