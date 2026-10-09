import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Named imports, not defaults: the route modules default-export the `Route` object
// the router consumes, and importing THAT to test a table would boot route matching
// for no benefit. Both pages export their component by name for exactly this.
import { OpeningsPage } from "@/routes/_app.org.recruitment.openings";
import { CandidatesPage } from "@/routes/_app.org.recruitment.candidates";

/**
 * THE TWO READ-ONLY SCREENS, AND WHY THEY ARE.
 *
 * Candidates is the searchable record of who applied; the pipeline board is where a
 * stage changes. These tests pin that separation, because it is the decision most
 * likely to be quietly undone by a well-meaning "let me add a move button here":
 *
 *   1. NO MOVE CONTROL ON THE CANDIDATES LIST. A stage change carries a reason — a
 *      rejection in particular — and two places to do it means two places to do it
 *      without one. Anyone who finds it missing should be pointed at the board.
 *   2. AN OPENING IS CLOSED, NEVER DELETED. Deleting cascades away the applications
 *      filed against the role, and the list of who applied has to survive the role
 *      being filled. That is why the row action is a status flip and the label says
 *      "close" rather than anything resembling removal.
 *   3. VACANCIES ARE COUNTED AGAINST HIRES. The column reads hired / total so the
 *      wall is visible before the server refuses the next hire with it.
 */

const OPENING = {
  uuid: "op-1",
  title: "Senior Accountant",
  department_id: 1,
  designation_id: 1,
  department_name: "Finance",
  designation_name: "Senior Accountant",
  location: "Karachi",
  employment_type: "full_time" as const,
  description: null,
  status: "open" as const,
  vacancies: 2,
  candidate_count: 3,
  hired_count: 1,
  vacancies_remaining: 1,
  created_at: "2026-01-01T00:00:00Z",
};

const CANDIDATE = {
  uuid: "c-1",
  job_opening_uuid: "op-1",
  opening_title: "Senior Accountant",
  full_name: "Ayesha Siddiqui",
  email: "ayesha@example.com",
  phone: null,
  cnic: null,
  stage: "screening" as const,
  rating: 4,
  notes: null,
  rejected_reason: null,
  converted_employee_uuid: null,
  offer_letter_uuid: null,
  hired_at: null,
  completed_interviews: 1,
  created_at: "2026-01-05T00:00:00Z",
};

const vi_mock = vi.hoisted(() => ({
  openingsList: vi.fn(),
  openingsUpdate: vi.fn(),
  openingsCreate: vi.fn(),
  candidatesList: vi.fn(),
  candidateGet: vi.fn(),
  moveStage: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return {
    ...actual,
    jobOpeningsService: {
      ...actual.jobOpeningsService,
      list: vi_mock.openingsList,
      update: vi_mock.openingsUpdate,
      create: vi_mock.openingsCreate,
    },
    candidatesService: {
      ...actual.candidatesService,
      list: vi_mock.candidatesList,
      get: vi_mock.candidateGet,
      moveStage: vi_mock.moveStage,
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/org/recruitment/candidates" }),
  createFileRoute: () => () => null,
}));

vi.mock("@/components/hr/ModuleGate", () => ({
  ModuleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function withClient(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const paginated = (items: unknown[]) => ({
  items,
  total: items.length,
  totalPages: 1,
  page: 1,
  limit: 20,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi_mock.openingsList.mockResolvedValue([OPENING]);
  vi_mock.openingsUpdate.mockResolvedValue({ ...OPENING, status: "closed" });
  vi_mock.candidatesList.mockResolvedValue(paginated([CANDIDATE]));
  vi_mock.candidateGet.mockResolvedValue({
    ...CANDIDATE,
    opening: null,
    interviews: [],
    resumes: [],
    resume_count: 0,
  });
});

describe("openings page", () => {
  it("closes an opening rather than deleting it", async () => {
    const user = userEvent.setup();
    withClient(<OpeningsPage />);

    await screen.findByText("Senior Accountant");
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    // A status flip. Never `remove`/`delete` — those would cascade away the
    // applications filed against the role.
    await waitFor(() =>
      expect(vi_mock.openingsUpdate).toHaveBeenCalledWith("op-1", { status: "closed" }),
    );
    expect(vi_mock.openingsUpdate).toHaveBeenCalledTimes(1);
  });

  it("offers Reopen on a closed opening, because closing is reversible", async () => {
    vi_mock.openingsList.mockResolvedValue([{ ...OPENING, status: "closed" as const }]);
    vi_mock.openingsUpdate.mockResolvedValue(OPENING);

    const user = userEvent.setup();
    withClient(<OpeningsPage />);

    await screen.findByText("Senior Accountant");
    await user.click(screen.getByRole("button", { name: /reopen/i }));

    await waitFor(() =>
      expect(vi_mock.openingsUpdate).toHaveBeenCalledWith("op-1", { status: "open" }),
    );
  });

  it("counts vacancies against hires so the limit is visible before it blocks", async () => {
    withClient(<OpeningsPage />);
    // 1 hired of 2 vacancies. Rendered as a fraction rather than a bare remaining
    // number, because "1" alone does not say whether it is one hired or one left.
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
  });
});

describe("candidates page", () => {
  it("offers NO stage-move control, keeping stage changes on the pipeline board", async () => {
    withClient(<CandidatesPage />);
    await screen.findByText("Ayesha Siddiqui");

    // The card in the last column of the table is a detail opener, not a move.
    expect(screen.queryByRole("button", { name: /^move/i })).not.toBeInTheDocument();
    expect(vi_mock.moveStage).not.toHaveBeenCalled();
  });

  it("filters by stage server-side rather than slicing the page in the browser", async () => {
    const user = userEvent.setup();
    withClient(<CandidatesPage />);

    await screen.findByText("Ayesha Siddiqui");
    await user.selectOptions(screen.getByLabelText(/stage/i), "rejected");

    // The request carries the filter. Filtering the returned page instead would show
    // nothing while rejected candidates existed, which reads as data loss.
    await waitFor(() =>
      expect(vi_mock.candidatesList).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "rejected", page: 1 }),
      ),
    );
  });

  it("returns to page 1 when a filter changes, so a narrow filter is not a blank table", async () => {
    vi_mock.candidatesList.mockResolvedValue(paginated([CANDIDATE]));
    const user = userEvent.setup();
    withClient(<CandidatesPage />);

    await screen.findByText("Ayesha Siddiqui");
    await user.selectOptions(screen.getByLabelText(/stage/i), "offered");

    await waitFor(() =>
      expect(vi_mock.candidatesList).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "offered", page: 1 }),
      ),
    );
  });
});
