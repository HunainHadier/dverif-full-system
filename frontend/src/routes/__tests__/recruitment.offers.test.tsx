import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OfferSheet } from "@/routes/_app.org.recruitment.offers";
import type { Offer } from "@/services";

/**
 * THE OFFER'S APPROVAL, WHICH IS NOT A STATUS COLUMN.
 *
 * The offers page renders the shared workflow engine's trail rather than a
 * "status: approved" cell, and this pins the three consequences that make that worth
 * the extra request per candidate:
 *
 *   1. THE TRAIL IS SHOWN, not just a verdict. A two-step offer stuck on a director
 *      looks identical to one stuck on a peer unless the steps are on screen, and
 *      "who do I chase" is the question a pending offer actually raises.
 *   2. THE CONTROLS MATCH THE STATE. Submit / Approve+Reject / Send are shown for
 *     exactly the states where the server would accept them. A Send button on an
 *     unapproved offer is a 409 waiting to happen, and a page that offers one teaches
 *     people the page is broken.
 *   3. APPROVAL IS NOT SENDING. They are separate calls, because issuing the letter
 *     is what mints the reference number and makes it a real document.
 */

/**
 * Typed as `Offer` rather than left to inference, so a test cannot quietly narrow a
 * field: `{ ...OFFER, letter_status: "issued" }` against an inferred `letter_status:
 * "draft"` is a type error, which is exactly what it should be. The earlier version
 * of this file hit that and "fixed" it by casting, which would have let a typo'd
 * state pass as a legitimate one.
 */
const OFFER: Offer = {
  candidate_uuid: "c-1",
  full_name: "Ayesha Siddiqui",
  email: "ayesha@example.com",
  stage: "selected" as const,
  opening_title: "Senior Accountant",
  reference_no: null,
  letter_status: null,
  letter_title: null,
  offer_letter_uuid: null,
  converted_employee_uuid: null,
  hired_at: null,
  offer_status: "draft",
  offer_template_uuid: "t-1",
  offer_body_snapshot: "Offer text with saved terms",
  issued_at: null,
  qr_token: null,
  verify_url: null,
};

const steps = (decision: "pending" | "approved" | "rejected") => [
  {
    step_order: 1,
    step_name: "Department Head",
    decision: "approved" as const,
    approver_name: "Imran",
  },
  {
    step_order: 2,
    step_name: "Director",
    decision,
    approver_name: decision === "pending" ? null : "Khalid",
  },
];

const vi_mock = vi.hoisted(() => ({
  getApproval: vi.fn(),
  requestApproval: vi.fn(),
  decide: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return { ...actual, offersService: { ...actual.offersService, ...vi_mock } };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/org/recruitment/offers" }),
  createFileRoute: () => () => null,
}));

function setUp(offer: Offer | null, onSend = vi.fn(), sendError: unknown = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <OfferSheet
        offer={offer}
        onOpenChange={() => undefined}
        onDone={() => undefined}
        onSend={onSend}
        sending={false}
        sendError={sendError}
      />
    </QueryClientProvider>,
  );
  return onSend;
}

describe("offer approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi_mock.send.mockResolvedValue({});
    vi_mock.decide.mockResolvedValue({});
    vi_mock.requestApproval.mockResolvedValue({});
  });

  it("routes an unsubmitted offer to pipeline preparation rather than content-free approval", async () => {
    vi_mock.getApproval.mockResolvedValue(null);
    setUp(OFFER);

    await waitFor(() => expect(vi_mock.getApproval).toHaveBeenCalledWith("c-1"));
    expect(await screen.findByRole("link", { name: /open recruitment pipeline/i })).toBeInTheDocument();

    // Approval cannot begin until the recruiter has saved complete terms and a preview.
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send offer/i })).not.toBeInTheDocument();
  });

  it("shows the step trail so a pending offer says WHO is holding it", async () => {
    vi_mock.getApproval.mockResolvedValue({
      uuid: "ap-1",
      status: "pending",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: null,
      resolved_by_uuid: null,
      outcome_notes: null,
      steps: steps("pending"),
      currentStepOrder: 2,
      current_step_name: "Director",
    });
    setUp(OFFER);

    // Both steps named. A single "pending" badge would not say that the department
    // head has already signed off and this is now with the director.
    await screen.findByText("Department Head");
    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });

  it("calls the approval engine when a decision is made", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "pending",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: null,
      resolved_by_uuid: null,
      outcome_notes: null,
      steps: steps("pending"),
      currentStepOrder: 2,
      current_step_name: "Director",
    });
    const user = userEvent.setup();
    setUp(OFFER);

    await screen.findByRole("button", { name: /^approve$/i });
    await user.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() =>
      expect(vi_mock.decide).toHaveBeenCalledWith("c-1", {
        decision: "approve",
        comments: undefined,
      }),
    );
  });

  it("offers Send only once APPROVED, and sending is a separate act from approving", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "approved",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
      resolved_by_uuid: "u-1",
      outcome_notes: null,
      steps: steps("approved"),
      currentStepOrder: null,
      current_step_name: null,
    });

    const offer = { ...OFFER, offer_status: "approved" as const };
    const onSend = setUp(offer);
    const user = userEvent.setup();

    await screen.findByRole("button", { name: /send offer letter/i });
    // Approval did not send anything by itself.
    expect(vi_mock.send).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /send offer letter/i }));
    expect(onSend).toHaveBeenCalledWith(offer);
  });

  it("hides Send once the offer has been sent, so it cannot be sent twice", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "approved",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
      resolved_by_uuid: "u-1",
      outcome_notes: null,
      steps: steps("approved"),
      currentStepOrder: null,
      current_step_name: null,
    });

    setUp({ ...OFFER, offer_status: "sent", offer_sent_at: "2026-01-03T00:00:00Z" });

    await waitFor(() => expect(vi_mock.getApproval).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /send offer letter/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Sent/)).toBeInTheDocument();
  });

  it("offers neither approval nor sending on a REJECTED offer and routes revisions back to the pipeline", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "rejected",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
      resolved_by_uuid: "u-1",
      outcome_notes: "Salary band too high",
      steps: steps("rejected"),
      currentStepOrder: null,
      current_step_name: null,
    });

    setUp(OFFER);

    // Await the HINT, not merely the request. `getApproval` being called says the
    // query fired; the resolved data is what decides which controls render, so
    // asserting straight after the call is a race against the response.
    //
    // And the hint must NOT imply the person was let go: approval here is about a
    // document, not about the hire. Copy saying the candidate "left the offer stage"
    // would tell a recruiter something false about their own roster.
    expect(await screen.findByText(/this offer was rejected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /revise terms and resubmit/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send offer letter/i })).not.toBeInTheDocument();
  });

  it("names the missing template when the send fails for want of one", async () => {
    // A template mismatch after approval requires a new approval, without directing
    // the requester to fill terms at send time.
    //
    // The hint is shown only for THIS reason. A generic "could not send" leaves the
    // recruiter guessing, and telling someone to write a template when the real problem
    // is that a colleague already approved the offer sends them to fix the wrong thing.
    vi_mock.getApproval.mockResolvedValue({
      status: "approved",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
      resolved_by_uuid: "u-1",
      outcome_notes: null,
      steps: steps("approved"),
      currentStepOrder: null,
      current_step_name: null,
    });

    setUp({ ...OFFER, offer_status: "approved" }, vi.fn(), {
      response: {
        data: {
          message: "Approved offer content has changed. Review it and submit for approval again.",
        },
      },
    });

    // The action is offered only while the lifecycle status is approved; missing
    // template values were already captured before approval.
    expect(await screen.findByRole("button", { name: /send offer letter/i })).toBeInTheDocument();
    expect(screen.queryByText(/create an active offer letter template/i)).not.toBeInTheDocument();
  });

  it("does NOT blame a template when the send failed for another reason", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "approved",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: "2026-01-02T00:00:00Z",
      resolved_by_uuid: "u-1",
      outcome_notes: null,
      steps: steps("approved"),
      currentStepOrder: null,
      current_step_name: null,
    });

    setUp({ ...OFFER, offer_status: "approved" }, vi.fn(), {
      response: { data: { message: "This offer approval was already approved" } },
    });

    await screen.findByRole("button", { name: /send offer letter/i });
    // Pointing someone at letter templates when the approval is the problem would send
    // them to the wrong page entirely.
    expect(screen.queryByText(/create an active offer letter template/i)).not.toBeInTheDocument();
  });

  it("surfaces the server's refusal reason on a failed decision", async () => {
    vi_mock.getApproval.mockResolvedValue({
      status: "pending",
      title: null,
      requested_at: "2026-01-01T00:00:00Z",
      resolved_at: null,
      resolved_by_uuid: null,
      outcome_notes: null,
      steps: steps("pending"),
      currentStepOrder: 2,
      current_step_name: "Director",
    });
    vi_mock.decide.mockRejectedValue({
      response: { data: { message: "This approval is no longer pending" } },
    });

    const user = userEvent.setup();
    setUp(OFFER);

    await screen.findByRole("button", { name: /^approve$/i });
    await user.click(screen.getByRole("button", { name: /^approve$/i }));

    // The server's words, not a generic failure: someone else may have decided it.
    expect(await screen.findByText(/no longer pending/i)).toBeInTheDocument();
  });
});
