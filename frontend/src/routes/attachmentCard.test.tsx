import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The attachment card, and the object-URL discipline behind it.
 *
 * THREE THINGS THAT ARE EASY TO GET WRONG AND HARD TO NOTICE.
 *
 * 1. THE BYTES ARE AUTHENTICATED. Attachments are served behind the org's
 *    session, so an <img src="/org/asset-attachments/..."> renders a 401 page as
 *    the image. Every byte has to come through axios as a Blob. This is the
 *    reason the card cannot simply use the stored path.
 *
 * 2. NOTHING LOADS EAGERLY. A drawer of twenty receipts would fire twenty
 *    authenticated requests on open, to show thumbnails nobody may look at. The
 *    fetch must be armed by hover or by opening the preview, never on mount.
 *
 * 3. EVERY OBJECT URL IS REVOKED. createObjectURL pins the Blob in memory for the
 *    life of the document. This app opens drawers repeatedly, so a leak is a slow
 *    tab-wide climb that looks like nothing at all.
 */
const downloadAttachment = vi.fn();
const removeAttachment = vi.fn();

vi.mock("@/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services")>();
  return {
    ...actual,
    assetsService: { ...actual.assetsService, downloadAttachment, removeAttachment },
  };
});

const { AttachmentCard } = await import("@/components/hr/AttachmentCard");

const image: import("@/services").AssetAttachment = {
  uuid: "att-img",
  file_name: "receipt-front.jpg",
  mime_type: "image/jpeg",
  file_size: 2048,
  category: "purchase_receipt",
  description: null,
  created_at: "2026-02-01T00:00:00Z",
};

const pdf: import("@/services").AssetAttachment = {
  ...image,
  uuid: "att-pdf",
  file_name: "invoice.pdf",
  mime_type: "application/pdf",
};

const doc: import("@/services").AssetAttachment = {
  ...image,
  uuid: "att-doc",
  file_name: "notes.docx",
  mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const blobFor = () => new Blob(["pretend-bytes"], { type: "image/jpeg" });

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  downloadAttachment.mockResolvedValue(blobFor());
  removeAttachment.mockResolvedValue({});
  let n = 0;
  createObjectURL = vi.fn(() => `blob:mock-${n++}`);
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(att = image, onDeleted = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttachmentCard attachment={att} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
  return onDeleted;
}

describe("attachment card", () => {
  it("does NOT fetch the file on mount", async () => {
    // The whole point of lazy loading. Twenty receipts must not cost twenty
    // authenticated requests just to open a drawer.
    renderCard();
    expect(screen.getByText("receipt-front.jpg")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("shows the filename and size without fetching", () => {
    renderCard();
    expect(screen.getByText("receipt-front.jpg")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("renders a thumbnail once hovered, from an authenticated blob", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AttachmentCard attachment={image} onDeleted={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await user.hover(screen.getByText("receipt-front.jpg"));

    await waitFor(() => expect(downloadAttachment).toHaveBeenCalledWith("att-img"));
    // Queried by tag, not role: the thumbnail is deliberately decorative
    // (alt=""), because the filename sits right beside it and a screen reader
    // would otherwise announce the same thing twice.
    await waitFor(() => {
      const thumb = container.querySelector("img");
      expect(thumb).toBeTruthy();
      expect(thumb).toHaveAttribute("src", "blob:mock-0");
    });
  });

  it("opens a preview of the image", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /view/i }));

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(downloadAttachment).toHaveBeenCalledWith("att-img");
  });

  it("opens a PDF in a NEW TAB, not in the modal", async () => {
    // UPDATED. This used to assert an <iframe> inside the modal. A receipt is
    // usually two pages and is read rather than glanced at, so it gets the whole
    // tab — a PDF viewer inside a dialog inside a drawer has a scrollbar inside a
    // scrollbar and about half the screen.
    downloadAttachment.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const win = {
      document: { title: "", body: { appendChild: vi.fn() }, createTextNode: vi.fn() },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.fn(() => win);
    vi.stubGlobal("open", open);

    renderCard(pdf);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open pdf in a new tab/i }));

    await waitFor(() => expect(win.location.replace).toHaveBeenCalled());
    // Blank tab claimed first, so the async fetch cannot be popup-blocked.
    expect(open).toHaveBeenCalledWith("", "_blank");
    // And the modal iframe path is gone entirely.
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("falls back to a DOWNLOAD when the new tab is blocked, and says so", async () => {
    // A blocked popup that silently does nothing is indistinguishable from a
    // broken page, so the user still gets the file AND an explanation.
    downloadAttachment.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    vi.stubGlobal("open", vi.fn(() => null));

    renderCard(pdf);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open pdf in a new tab/i }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocked/i);
  });

  it("offers no View button for an unviewable type, but the filename still works", async () => {
    // UPDATED. The filename used to be a dead label for a docx, which reads as a
    // broken card next to two working buttons. It now downloads — the only outcome
    // that actually hands the user the file.
    renderCard(doc);
    expect(
      screen.queryByRole("button", { name: /open pdf in a new tab/i }),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /notes\.docx/ }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(downloadAttachment).toHaveBeenCalledWith("att-doc");
  });

  it("downloads via a blob and revokes the temporary URL", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download/i }));

    // Both in one waitFor: userEvent's click also fires mouseenter, which arms
    // the thumbnail fetch, so createObjectURL can legitimately be called by the
    // preview path before saveBlob runs. Asserting each separately races against
    // that and fails intermittently.
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    });
  });

  it("OPENS a confirmation and does NOT delete until it is confirmed", async () => {
    const onDeleted = renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /remove|delete/i }));

    // The guard itself: a click on the delete icon must reach no API at all.
    // A purchase receipt is the one file in this drawer that cannot be recreated
    // from data, so a stray click must be inert.
    await waitFor(() => {
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });
    expect(removeAttachment).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^(remove|delete)$/i }));

    await waitFor(() => expect(removeAttachment).toHaveBeenCalledWith("att-img"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("cancelling the confirmation deletes nothing", async () => {
    const onDeleted = renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /remove|delete/i }));
    await waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument());

    // Escape is the fastest way out and the one most likely to be pressed by
    // reflex, so it is the one worth asserting on.
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument());
    expect(removeAttachment).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and explains a failed delete", async () => {
    // Closing on failure would look identical to succeeding, with the row still
    // sitting there and no message.
    removeAttachment.mockRejectedValue(new Error("Request failed with status code 500"));
    renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /remove|delete/i }));
    await waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^(remove|delete)$/i }));

    await waitFor(() => expect(removeAttachment).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/could not remove the file/i)).toBeInTheDocument());
    // Still open, so the user is not left staring at a dialog that vanished.
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});

describe("object URL lifecycle", () => {
  it("revokes the preview URL when the card unmounts", async () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AttachmentCard attachment={image} onDeleted={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /view/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    expect(revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    // Not revoking here pins the Blob in memory for the life of the document.
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it("revokes the download URL even when the anchor click throws", async () => {
    renderCard();
    const user = userEvent.setup();
    // Force the anchor path to fail so the finally branch is actually exercised.
    // Without a finally, a blocked download leaks the Blob for the life of the
    // document, which is exactly the case a "happy path" test would miss.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("popup blocked");
    });

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("says the download failed instead of failing silently", async () => {
    // The test above only checked the URL was revoked. It never checked that the
    // user found out anything, which is why a blocked download reported nothing
    // at all and left an unhandled rejection behind.
    renderCard();
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("popup blocked");
    });

    await user.click(screen.getByRole("button", { name: /download/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/download failed/i);
    clickSpy.mockRestore();
  });
});

describe("service contract", () => {
  it("fetches attachments through axios so the auth header is sent", () => {
    // A plain link would render a 401 as the file. Asserted on the source because
    // the behaviour lives in the request, not the render.
    const src = readFileSync("src/services/assets.ts", "utf8");
    expect(src).toMatch(/downloadAttachment[\s\S]{0,240}responseType:\s*"blob"/);
  });

  it("never builds an <img> or <a> straight at the attachment endpoint", () => {
    const card = readFileSync("src/components/hr/AttachmentCard.tsx", "utf8");
    expect(card).not.toMatch(/attachmentDownloadUrl\(/);
    expect(card).not.toMatch(/(src|href)=\{?["'`]\/org\/asset-attachments/);
  });
});
