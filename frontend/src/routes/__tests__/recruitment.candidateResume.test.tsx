import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { CandidatesPage } from "@/routes/_app.org.recruitment.candidates";
import type { CandidateDetail } from "@/services/recruitment";

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
  candidate_count: 1,
  hired_count: 0,
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
  stage: "applied" as const,
  rating: null,
  notes: null,
  rejected_reason: null,
  converted_employee_uuid: null,
  offer_letter_uuid: null,
  hired_at: null,
  completed_interviews: 0,
  created_at: "2026-01-05T00:00:00Z",
};

const vi_mock = vi.hoisted(() => ({
  openingsList: vi.fn(),
  candidatesList: vi.fn(),
  candidateGet: vi.fn(),
  candidateCreate: vi.fn(),
  resumeUpload: vi.fn(),
  resumeParse: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return {
    ...actual,
    jobOpeningsService: { ...actual.jobOpeningsService, list: vi_mock.openingsList },
    candidatesService: {
      ...actual.candidatesService,
      list: vi_mock.candidatesList,
      get: vi_mock.candidateGet,
      create: vi_mock.candidateCreate,
      uploadResume: vi_mock.resumeUpload,
      parseResume: vi_mock.resumeParse,
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

function cvFile(name = "ayesha-siddiqui-cv.pdf") {
  return new File(["cv bytes"], name, { type: "application/pdf" });
}

async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Ayesha Siddiqui");
  await user.click(screen.getByRole("button", { name: /add candidate/i }));
  const dialog = await screen.findByRole("dialog");
  return dialog;
}

/** The hidden <input type=file> the FileDropzone's picker drives. */
function fileInput(dialog: HTMLElement) {
  return dialog.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi_mock.openingsList.mockResolvedValue([OPENING]);
  vi_mock.candidatesList.mockResolvedValue(paginated([CANDIDATE]));
  vi_mock.candidateGet.mockResolvedValue({
    ...CANDIDATE,
    opening: null,
    interviews: [],
    resumes: [],
    resume_count: 0,
  } satisfies CandidateDetail);
  vi_mock.candidateCreate.mockResolvedValue(CANDIDATE);
  vi_mock.resumeUpload.mockResolvedValue([]);
  vi_mock.resumeParse.mockResolvedValue({
    name: null,
    name_confidence: null,
    cnic: null,
    cnic_confidence: null,
    designation: null,
    designation_confidence: null,
  });
});

/**
 * All six toasts worth asserting on for this flow are WARNINGS or ERRORS, and
 * the success ones are covered by the query invalidation the page does instead.
 * Clearing per test keeps a count assertion from leaking into the next one.
 */
const toastSpy = vi.spyOn(toast, "warning");

describe("Add Candidate - resume upload", () => {
  it("reads a dropped CV and fills the fields the extractor can produce", async () => {
    vi_mock.resumeParse.mockResolvedValue({
      name: "Ayesha Siddiqui",
      name_confidence: "high",
      cnic: "42101-2345678-9",
      cnic_confidence: "high",
      designation: "Senior Accountant",
      designation_confidence: "low",
      email: "ayesha@example.com",
      email_confidence: "high",
      phone: "+92 322 1315218",
      phone_confidence: "high",
    });

    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    await user.upload(fileInput(dialog), cvFile());

    await waitFor(() => expect(vi_mock.resumeParse).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (within(dialog).getByLabelText(/full name/i) as HTMLInputElement).value,
      ).toBe("Ayesha Siddiqui"),
    );

    // Degraphed: an input holding the dashes would submit them and fail.
    expect((within(dialog).getByLabelText(/^CNIC/) as HTMLInputElement).value).toBe(
      "4210123456789",
    );

    // The header parser reads these alongside the name.
    expect((within(dialog).getByLabelText(/^Email/) as HTMLInputElement).value).toBe(
      "ayesha@example.com",
    );
    expect((within(dialog).getByLabelText(/^Phone/) as HTMLInputElement).value).toBe(
      "+92 322 1315218",
    );
  });

  it("attaches the CV to the candidate it created, in that order", async () => {
    vi_mock.resumeParse.mockResolvedValue({
      name: "Ayesha Siddiqui",
      name_confidence: "high",
      cnic: null,
      cnic_confidence: null,
      designation: null,
      designation_confidence: null,
      email: "ayesha@example.com",
      email_confidence: "high",
      phone: null,
      phone_confidence: null,
    });

    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    await user.upload(fileInput(dialog), cvFile());
    await waitFor(() => expect(vi_mock.resumeParse).toHaveBeenCalled());

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(vi_mock.candidateCreate).toHaveBeenCalledTimes(1));
    const created = vi_mock.candidateCreate.mock.calls[0][0] as { full_name: string };
    expect(created.full_name).toBe("Ayesha Siddiqui");

    await waitFor(() => expect(vi_mock.resumeUpload).toHaveBeenCalledTimes(1));
    expect(vi_mock.resumeUpload).toHaveBeenCalledWith("c-1", [expect.any(File)]);
  });

  it("keeps the typed form and the selected file when the CV cannot be read", async () => {
    vi_mock.resumeParse.mockRejectedValue(new Error("document service unreachable"));

    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText(/full name/i), "Bilal Ahmed");
    await user.type(within(dialog).getByLabelText(/^Email/), "bilal@example.com");
    await user.upload(fileInput(dialog), cvFile());

    // Failure stated next to the control that failed, not as a toast alone.
    expect(await within(dialog).findByText(/could not read the cv/i)).toBeInTheDocument();

    // The typing survives the failed network call.
    expect((within(dialog).getByLabelText(/full name/i) as HTMLInputElement).value).toBe(
      "Bilal Ahmed",
    );

    // File still selected, so a retry does not need the picker again.
    expect(within(dialog).getByText("ayesha-siddiqui-cv.pdf")).toBeInTheDocument();

    // And the candidate can still be saved. "Cannot read this file" must never
    // mean "cannot add this person".
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(vi_mock.candidateCreate).toHaveBeenCalledTimes(1));
    expect(vi_mock.resumeUpload).toHaveBeenCalledTimes(1);
  });

  it("retries the read of the same file after a failure", async () => {
    vi_mock.resumeParse.mockRejectedValueOnce(new Error("timeout"));
    vi_mock.resumeParse.mockResolvedValueOnce({
      name: "Ayesha Siddiqui",
      name_confidence: "high",
      cnic: null,
      cnic_confidence: null,
      designation: null,
      designation_confidence: null,
    });

    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    await user.upload(fileInput(dialog), cvFile());
    await within(dialog).findByText(/could not read the cv/i);

    await user.click(within(dialog).getByRole("button", { name: /try reading/i }));
    await waitFor(() => expect(vi_mock.resumeParse).toHaveBeenCalledTimes(2));

    await waitFor(() =>
      expect(
        (within(dialog).getByLabelText(/full name/i) as HTMLInputElement).value,
      ).toBe("Ayesha Siddiqui"),
    );
    expect(within(dialog).queryByText(/could not read the cv/i)).not.toBeInTheDocument();
  });

  it("saves without a CV when the dropzone is skipped, and never calls the upload", async () => {
    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    // The no-resume state is stated, not left as an unexplained blank.
    expect(within(dialog).getByText(/no cv attached/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/full name/i), "Hassan Raza");
    await user.type(within(dialog).getByLabelText(/^Email/), "hassan@example.com");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(vi_mock.candidateCreate).toHaveBeenCalledTimes(1));
    // No file, so no upload call at all - not an upload with an empty list.
    expect(vi_mock.resumeUpload).not.toHaveBeenCalled();
    expect(vi_mock.resumeParse).not.toHaveBeenCalled();
  });

  it("keeps the candidate when the CV upload fails, and says the CV still needs attaching", async () => {
    vi_mock.resumeParse.mockResolvedValue({
      name: "Ayesha Siddiqui",
      name_confidence: "high",
      cnic: null,
      cnic_confidence: null,
      designation: null,
      designation_confidence: null,
      email: "ayesha@example.com",
      email_confidence: "high",
      phone: null,
      phone_confidence: null,
    });
    vi_mock.resumeUpload.mockRejectedValue(new Error("upload failed"));

    const user = userEvent.setup();
    withClient(<CandidatesPage />);
    const dialog = await openAddDialog(user);

    await user.upload(fileInput(dialog), cvFile());
    await waitFor(() => expect(vi_mock.resumeParse).toHaveBeenCalled());

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // The candidate exists. Reporting only the failure would have the recruiter
    // re-add them and hit the 409 duplicate.
    await waitFor(() => expect(vi_mock.candidateCreate).toHaveBeenCalledTimes(1));

    // Both halves said out loud: the record is saved, the CV is not attached.
    // Spied rather than rendered because sonner's output is portalled and the
    // existing convention in this suite is to assert on the call, not the DOM.
    const warning = toastSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(warning).toMatch(/candidate added/i);
    expect(warning).toMatch(/could not be attached/i);

    // The dialog closes: the save succeeded as far as the record is concerned,
    // and leaving it open would imply it did not.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
