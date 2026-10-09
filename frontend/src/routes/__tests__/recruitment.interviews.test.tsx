import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { InterviewsPage } from "@/routes/_app.org.recruitment.interviews";

/**
 * THE AGENDA, NOT A CALENDAR.
 *
 * Three decisions this page makes that are worth pinning, because each looks like a
 * cosmetic choice until it ships and produces the wrong expectation:
 *
 *   1. NO MONTH GRID. The backend stores one `scheduled_at` per interview and refuses
 *      a double-booked INTERVIEWER. A calendar grid would imply free/busy management
 *      over rooms and people, which this module does not model — so the presentation
 *      is a chronological list where the interviewer is on every row, which is what
 *      makes a clash noticeable.
 *   2. UPCOMING AND PAST ARE SEPARATE. Someone opening this page is almost always
 *      asking what is next; mixing last month's completed interviews into that list
 *      buries the answer. The split is client-side because the split is a function of
 *      WHEN you are looking, not something the server stored.
 *   3. OUTCOME DEFAULTS TO `pending`, NOT `passed`. The single most common end state
 *      of a first interview is "met them, not decided yet". A form that preselects a
 *      pass turns an accidental Enter into an approval of a real person.
 */

const INTERVIEW = {
  uuid: "i-1",
  candidate_uuid: "c-1",
  candidate_name: "Ayesha Siddiqui",
  interviewer_uuid: "u-1",
  scheduled_at: "2026-06-01T10:00:00Z",
  mode: "video" as const,
  location: null,
  feedback_notes: null,
  rating: null,
  status: "scheduled" as const,
  outcome: "pending" as const,
  created_at: "2026-05-20T00:00:00Z",
};

const vi_mock = vi.hoisted(() => ({
  list: vi.fn(),
  schedule: vi.fn(),
  recordFeedback: vi.fn(),
  candidatesList: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return {
    ...actual,
    interviewsService: {
      ...actual.interviewsService,
      list: vi_mock.list,
      schedule: vi_mock.schedule,
      recordFeedback: vi_mock.recordFeedback,
    },
    candidatesService: { ...actual.candidatesService, list: vi_mock.candidatesList },
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/org/recruitment/interviews" }),
  createFileRoute: () => () => null,
}));

vi.mock("@/components/hr/ModuleGate", () => ({
  ModuleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function setUp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <InterviewsPage />
    </QueryClientProvider>,
  );
}

/** An hour either side of now, so the split does not depend on the machine's clock. */
const offsetIso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi_mock.candidatesList.mockResolvedValue({
    items: [{ uuid: "c-1", full_name: "Ayesha Siddiqui" }],
    total: 1,
    totalPages: 1,
    page: 1,
    limit: 200,
  });
  vi_mock.recordFeedback.mockResolvedValue({ ...INTERVIEW, status: "cancelled" });
  vi_mock.schedule.mockResolvedValue(INTERVIEW);
});

describe("interviews agenda", () => {
  it("separates upcoming from past rather than mixing them in one list", async () => {
    vi_mock.list.mockResolvedValue([
      { ...INTERVIEW, uuid: "i-up", scheduled_at: offsetIso(24) },
      {
        ...INTERVIEW,
        uuid: "i-past",
        scheduled_at: offsetIso(-24),
        status: "completed",
        outcome: "passed",
      },
    ]);

    setUp();

    // Both are on the page, but under different headings. A single chronological list
    // would put last month's completed interview above today's meeting.
    // Await a ROW, not the "Upcoming" heading. The heading is rendered unconditionally
    // before the query resolves, so waiting on it proves nothing and every assertion
    // after it runs against an empty board. `findAllByText` because the same candidate
    // legitimately appears in both sections — which is itself the thing under test.
    const rows = await screen.findAllByText("Ayesha Siddiqui");
    expect(rows).toHaveLength(2);

    // Both interviews are on the page, under different headings. One chronological
    // list would put last month's completed interview above today's meeting.
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
  });

  it("cancels through the feedback endpoint, because that is where status lives", async () => {
    vi_mock.list.mockResolvedValue([{ ...INTERVIEW, scheduled_at: offsetIso(24) }]);
    const user = userEvent.setup();
    setUp();

    await screen.findByRole("button", { name: /cancel/i });
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(vi_mock.recordFeedback).toHaveBeenCalledWith("i-1", { status: "cancelled" }),
    );
  });

  it("defaults the feedback outcome to pending, so Enter cannot approve a candidate", async () => {
    vi_mock.list.mockResolvedValue([{ ...INTERVIEW, scheduled_at: offsetIso(24) }]);
    const user = userEvent.setup();
    setUp();

    await screen.findByRole("button", { name: /record feedback/i });
    await user.click(screen.getByRole("button", { name: /record feedback/i }));

    const outcome = await screen.findByLabelText(/outcome/i);
    // Not `passed`: most first interviews end with the panel still undecided, and a
    // preselected pass is one stray Enter away from recording a decision nobody made.
    expect(outcome).toHaveValue("pending");
  });

  it("offers no feedback control on an interview that already has it", async () => {
    vi_mock.list.mockResolvedValue([
      { ...INTERVIEW, scheduled_at: offsetIso(-24), status: "completed", outcome: "passed" },
    ]);
    setUp();

    await screen.findByText("Earlier");
    // The server answers 409 on a second feedback write, so the control is not shown.
    expect(screen.queryByRole("button", { name: /record feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("converts the wall-clock datetime-local value to UTC on submit", async () => {
    vi_mock.list.mockResolvedValue([]);
    const user = userEvent.setup();
    setUp();

    await screen.findByRole("button", { name: /schedule interview/i });
    await user.click(screen.getByRole("button", { name: /schedule interview/i }));

    // `datetime-local` has no timezone. Sending the string verbatim would have the
    // server store wall-clock time as UTC and shift every interview by the browser's
    // offset — so the assertion is on the ISO form, not just "it was called".
    await user.type(await screen.findByLabelText(/date and time/i), "2026-06-01T09:30");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(vi_mock.schedule).toHaveBeenCalled());
    const arg = vi_mock.schedule.mock.calls[0][0];
    expect(arg.scheduled_at).toMatch(/Z$/);
    expect(new Date(arg.scheduled_at).toISOString()).toBe(arg.scheduled_at);
  });
});
