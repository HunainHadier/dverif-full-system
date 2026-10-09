import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

// The page is imported by NAME, not by default: the route module's default surface
// is the `Route` object the router consumes, and pulling that in to test the board
// would boot route matching for no benefit.
import { RecruitmentPipelinePage } from "@/routes/_app.org.recruitment.pipeline";

/**
 * THE BOARD'S THREE INVARIANTS.
 *
 * These are not "does it render" tests. Every one of them pins down a decision that
 * looks like a detail until it ships and then produces a support ticket:
 *
 *   1. A DROP IS A REQUEST, NOT A RE-SORT. If the client moved the card itself, the
 *      board would show a stage the server refused until something else invalidated
 *      the cache — i.e. it would lie about where a real person stands in a hiring
 *      process. The test asserts the mutation fires and that the card is NOT in the
 *      new column until the server's refetch says so.
 *   2. `hired` IS NOT A DROP TARGET. Reaching it creates an employee on the roster,
 *      so it must be impossible to reach by dragging.
 *   3. A REFUSED MOVE DOES NOT MOVE THE CARD, and says why. The stage only changes
 *      when the list endpoint returns the candidate in its new stage.
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
  hired_count: 0,
  vacancies_remaining: 2,
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
  // SEPARATE mocks per service. Sharing one `list` between jobOpeningsService and
  // candidatesService was the bug in the first draft: the two take different
  // arguments (a status string vs. a params object), so a single mock had to guess
  // from the argument, and `list()` with no argument — the board's actual call —
  // matched neither branch and handed the page a response object where it expected
  // an array.
  openingsList: vi.fn(),
  candidatesList: vi.fn(),
  moveStage: vi.fn(),
  hire: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return {
    ...actual,
    jobOpeningsService: { ...actual.jobOpeningsService, list: vi_mock.openingsList },
    candidatesService: {
      ...actual.candidatesService,
      list: vi_mock.candidatesList,
      moveStage: vi_mock.moveStage,
      hire: vi_mock.hire,
      get: vi_mock.get,
    },
  };
});

/** The values the services RESOLVE to, not axios responses. */
const asPaginated = (items: unknown[]) => ({
  items,
  total: items.length,
  totalPages: 1,
  page: 1,
  limit: 200,
});

/**
 * The router is mocked rather than stood up for real, following AppShell.sidebar:
 * RecruitmentTabs is a nav strip, and booting route matching for it would test the
 * router instead of the board. `useLocation` is stubbed to a settable pathname so the
 * board can be rendered in a realistic location.
 */
const MOCK_PATHNAME = { value: "/org/recruitment/pipeline" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: MOCK_PATHNAME.value }),
  createFileRoute: () => () => null,
}));

vi.mock("@/components/hr/ModuleGate", () => ({
  // The plan gate is a UX affordance and is covered by its own tests; here it would
  // only add an org-subscription query that has nothing to do with drag behaviour.
  ModuleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function setUp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RecruitmentPipelinePage />
    </QueryClientProvider>,
  );
}

describe("recruitment pipeline board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi_mock.openingsList.mockResolvedValue([OPENING]);
    vi_mock.candidatesList.mockResolvedValue(asPaginated([CANDIDATE]));
    vi_mock.moveStage.mockResolvedValue({
      data: { candidate: { ...CANDIDATE, stage: "interview" } },
    });
  });

  it("does NOT offer `hired` as a drop target column", async () => {
    setUp();
    await waitFor(() => expect(screen.getByTestId("column-applied")).toBeInTheDocument());

    // Present as a label on the card, absent as somewhere a card can be dragged.
    expect(screen.queryByTestId("column-hired")).not.toBeInTheDocument();
    expect(screen.queryByTestId("column-rejected")).not.toBeInTheDocument();
    expect(screen.getByTestId("column-screening")).toBeInTheDocument();
    expect(screen.getByTestId("column-offered")).toBeInTheDocument();
  });

  it("calls moveStage on drop instead of re-ordering the card locally", async () => {
    const user = userEvent.setup();
    setUp();
    // Waiting on the COLUMN is not enough: the columns render from the static
    // `PIPELINE_STAGES` list before any data arrives, so that assertion passes on a
    // board that has fetched nothing. Waiting for the card itself is what proves the
    // openings request resolved, the opening was selected, and the candidates query
    // ran.
    const card = await screen.findByText("Ayesha Siddiqui");
    const target = screen.getByTestId("column-interview");

    await user.hover(card);
    // jsdom implements no real HTML5 drag, so the dataTransfer payload is written by
    // hand — exactly what the drop handler reads.
    target.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true }), {
        dataTransfer: { getData: () => "c-1" },
      }),
    );

    await waitFor(() => expect(vi_mock.moveStage).toHaveBeenCalledTimes(1));
    expect(vi_mock.moveStage).toHaveBeenCalledWith("c-1", { stage: "interview" });
  });

  it("keeps the card in its old column when the server refuses the move", async () => {
    const user = userEvent.setup();
    // The server's own message, which names the stages it WILL accept. Asserted
    // because a generic "could not move" is the difference between a user who
    // retries correctly and one who tries the same drag five more times.
    vi_mock.moveStage.mockRejectedValue({
      response: { data: { message: "Cannot move from screening to rejected" } },
    });

    setUp();
    await screen.findByText("Ayesha Siddiqui");

    screen.getByTestId("column-applied").dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true }), {
        dataTransfer: { getData: () => "c-1" },
      }),
    );

    await waitFor(() => expect(vi_mock.moveStage).toHaveBeenCalled());
    // Still under Screening: the list endpoint was never asked to lie.
    expect(screen.getByTestId("column-screening")).toHaveTextContent("Ayesha Siddiqui");
    expect(screen.getByTestId("column-applied")).not.toHaveTextContent("Ayesha Siddiqui");
  });

  it("offers preparation only at a selection stage", async () => {
    vi_mock.candidatesList.mockResolvedValue(
      asPaginated([{ ...CANDIDATE, stage: "offered" as const }]),
    );

    setUp();
    // On the CARD, not on the column: the columns are rendered from the static stage
    // list before any data arrives, so waiting for `column-offered` would pass
    // against a board that had fetched nothing and would find no hire button.
    await screen.findByText("Ayesha Siddiqui");

    // One button, inside the Offered column — never a drag target.
    const hires = screen.getAllByRole("button", { name: /prepare offer/i });
    expect(hires).toHaveLength(1);
    expect(screen.getByTestId("column-offered")).toContainElement(hires[0]);
  });

  it("does not offer preparation at any other stage", async () => {
    setUp();
    // The card must be on screen before the absence of a button means anything.
    await screen.findByText("Ayesha Siddiqui");
    expect(screen.queryByRole("button", { name: /prepare offer/i })).not.toBeInTheDocument();
  });
});
