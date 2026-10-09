import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { InterviewsPage } from "@/routes/_app.org.recruitment.interviews";

/**
 * THE TWO FAILURES A RECRUITER ACTUALLY HIT, PINNED AS TESTS.
 *
 * Both of these were live bugs reported from the browser, and both were invisible in
 * the type checker and the happy-path tests:
 *
 *  1. THE INTERVIEWER FIELD ASKED FOR A UUID. It was a text box labelled
 *     "Interviewer", so every user typed a colleague's NAME and the server answered
 *     `400 Interviewer UUID must be a valid UUID`. The control could not be filled
 *     correctly by anyone who did not already have the uuid to hand — which is nobody.
 *
 *  2. THE FAILURE WAS SILENT. The api interceptor deliberately does NOT toast; it
 *     rethrows so each caller can decide. A mutation without an `onError` therefore
 *     swallows its own failure: booking an interview for a candidate still at
 *     `applied` toasted nothing, closed nothing, and left the recruiter pressing Save
 *     on a form that could never succeed.
 *
 * The general rule these two share: a control that cannot be filled correctly by
 * knowing what the thing is should not exist, and an error the user caused must reach
 * the user.
 */

const INTERVIEW = {
  uuid: "i-1",
  candidate_uuid: "c-1",
  candidate_name: "Ayesha Siddiqui",
  interviewer_uuid: "e-1",
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
  employees: vi.fn(),
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
    orgService: { ...actual.orgService, employees: vi_mock.employees },
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

const toastSpy = vi.spyOn(toast, "error");

function setUp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <InterviewsPage />
    </QueryClientProvider>,
  );
}

const employee = (uuid: string, full_name: string, status: string, designation?: string) => ({
  uuid,
  full_name,
  designation: designation ?? null,
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  toastSpy.mockClear();
  vi_mock.list.mockResolvedValue([]);
  vi_mock.schedule.mockResolvedValue(INTERVIEW);
  vi_mock.recordFeedback.mockResolvedValue(INTERVIEW);
  vi_mock.candidatesList.mockResolvedValue({
    items: [{ uuid: "c-1", full_name: "Ayesha Siddiqui" }],
    total: 1,
    totalPages: 1,
    page: 1,
    limit: 200,
  });
  vi_mock.employees.mockResolvedValue({
    items: [
      employee("e-1", "Imran Shah", "current_employee", "Head of Finance"),
      employee("e-2", "Khalid Rehman", "active"),
      employee("e-3", "Departed Person", "ex_employee"),
    ],
    total: 3,
    totalPages: 1,
    page: 1,
    limit: 100,
  });
});

describe("scheduling an interview", () => {
  it("picks the interviewer from the roster by NAME, not by typed uuid", async () => {
    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole("button", { name: /schedule interview/i }));
    const picker = await screen.findByLabelText(/interviewer/i);

    // The reported bug: a text box that wanted a uuid while looking like a name field.
    expect(picker.tagName).toBe("SELECT");
    expect(picker).not.toHaveAttribute("type", "text");

    // Real colleagues, listed by the name a user would recognise.
    const labels = Array.from((picker as HTMLSelectElement).options).map((o) => o.text);
    expect(labels.some((l) => l.includes("Imran Shah"))).toBe(true);
    expect(labels.some((l) => l.includes("Khalid Rehman"))).toBe(true);

    // And selecting one yields the uuid, which is the whole point.
    await user.selectOptions(picker, "e-1");
    await user.type(await screen.findByLabelText(/date and time/i), "2026-06-01T09:30");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(vi_mock.schedule).toHaveBeenCalled());
    expect(vi_mock.schedule.mock.calls[0][0].interviewer_uuid).toBe("e-1");
  }, 15000);

  it("does not offer someone who has left the company", async () => {
    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole("button", { name: /schedule interview/i }));
    const picker = (await screen.findByLabelText(/interviewer/i)) as HTMLSelectElement;

    const values = Array.from(picker.options).map((o) => o.value);
    // Booking a meeting with a leaver is not something the server objects to, so the
    // client has to.
    expect(values).not.toContain("e-3");
    expect(values).toContain("e-1");
    expect(values).toContain("e-2");
  });

  it("labels the empty option, because an unassigned interviewer is a real state", async () => {
    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole("button", { name: /schedule interview/i }));
    const picker = (await screen.findByLabelText(/interviewer/i)) as HTMLSelectElement;

    // An interview can legitimately be booked before a panel is assigned, so this is
    // not a required field — but an unlabelled blank option reads as a bug.
    const blank = Array.from(picker.options).find((o) => o.value === "");
    expect(blank?.textContent).toMatch(/not assigned/i);
  });

  it("looks the interviewer list up across the WHOLE org, not just this admin's own adds", async () => {
    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole("button", { name: /schedule interview/i }));
    await screen.findByLabelText(/interviewer/i);

    // Without `scope: "org"` an org_admin sees only employee records they personally
    // added, so a colleague another admin onboarded is silently missing from the list.
    expect(vi_mock.employees).toHaveBeenCalledWith(expect.objectContaining({ scope: "org" }));
  });

  it("SURFACES the server's refusal instead of failing silently", async () => {
    // The exact response a recruiter saw: the candidate is still at `applied`.
    vi_mock.schedule.mockRejectedValue({
      response: {
        data: {
          message:
            'Move this candidate to the interview stage before scheduling them for one (they are at "applied")',
        },
      },
    });

    const user = userEvent.setup();
    setUp();

    await user.click(screen.getByRole("button", { name: /schedule interview/i }));
    await user.type(await screen.findByLabelText(/date and time/i), "2026-06-01T09:30");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // Without this the dialog just sat there. The api interceptor does not toast, so a
    // mutation with no onError swallows the failure entirely.
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    // The server's own wording, which names the missing prerequisite — a generic
    // "could not save" would leave the recruiter guessing which of the two it was.
    expect(String(toastSpy.mock.calls[0][0])).toMatch(/interview stage/i);

    // And the dialog stayed open, so the typed time is not lost.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still surfaces the error for feedback, which was the other silent path", async () => {
    vi_mock.list.mockResolvedValue([INTERVIEW]);
    vi_mock.recordFeedback.mockRejectedValue({
      response: { data: { message: "This interview's feedback has already been recorded" } },
    });

    const user = userEvent.setup();
    setUp();

    // `screen`, not `user`: userEvent has no async findBy — that is testing-library's.
    await screen.findByRole("button", { name: /record feedback/i });
    await user.click(screen.getByRole("button", { name: /record feedback/i }));
    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(String(toastSpy.mock.calls[0][0])).toMatch(/already been recorded/i);
  });
});
