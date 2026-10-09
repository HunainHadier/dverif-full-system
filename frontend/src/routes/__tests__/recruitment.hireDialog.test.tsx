import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HireDialog } from "@/routes/_app.org.recruitment.pipeline";
import type { Candidate, JobOpening } from "@/services";

const CANDIDATE: Candidate = {
  uuid: "c-1", job_opening_uuid: "op-1", opening_title: "Engineer", full_name: "Ayesha Siddiqui",
  email: "ayesha@example.com", phone: null, cnic: null, stage: "selected", rating: null,
  notes: null, rejected_reason: null, converted_employee_uuid: null, offer_letter_uuid: null,
  hired_at: null, created_at: "2026-01-01T00:00:00Z",
};
const OPENING: JobOpening = {
  uuid: "op-1", title: "Engineer", department_id: 1, designation_id: 1,
  department_name: "Finance", designation_name: "Engineer", location: null,
  employment_type: "full_time", description: null, status: "open", vacancies: 1,
  candidate_count: 1, hired_count: 0, created_at: "2026-01-01T00:00:00Z",
};
const vi_mock = vi.hoisted(() => ({ prepare: vi.fn(), preview: vi.fn(), submit: vi.fn(), submitOverride: vi.fn() }));
vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return {
    ...actual,
    offersService: { ...actual.offersService, prepare: vi_mock.prepare, preview: vi_mock.preview },
    candidatesService: { ...actual.candidatesService, prepareOffer: vi_mock.submit, prepareOfferWithInterviewOverride: vi_mock.submitOverride },
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: "/org/recruitment/pipeline" }),
  createFileRoute: () => () => null,
}));

const prep = {
  candidate: { uuid: "c-1", full_name: "Ayesha Siddiqui", email: "ayesha@example.com", cnic: null, final_interview_outcome: null },
  opening: { uuid: "op-1", title: "Engineer", designation: "Engineer", department: "Finance" },
  templates: [
    { uuid: "tpl-offer", name: "Offer template", letter_type: "offer", is_active: 1, body: "$designation / $designation / $department / $new_salary", merge_fields: ["designation", "department", "new_salary"] },
    { uuid: "tpl-increment", name: "Salary increment", letter_type: "increment", is_active: 1, body: "$current_salary", merge_fields: ["current_salary"] },
  ],
  merge_tags: [
    { tag: "designation", label: "Designation", source: "opening.designation", help: "From opening", letter_types: ["offer"] },
    { tag: "department", label: "Department", source: "opening.department", help: "From opening", letter_types: ["offer"] },
    { tag: "new_salary", label: "Offered salary", source: "manual", help: "Enter offered salary", letter_types: ["offer"] },
  ],
  default_values: { designation: "Engineer", department: "Finance", new_salary: "" },
  selected_template_uuid: "tpl-offer",
};
function setUp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={qc}><HireDialog candidate={CANDIDATE} opening={OPENING} onOpenChange={() => undefined} onDone={() => undefined} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi_mock.prepare.mockResolvedValue(prep);
  vi_mock.preview.mockResolvedValue({ template_uuid: "tpl-offer", template_name: "Offer template", values: {}, rendered_body: "", unresolved: ["new_salary"], unknown: [], required_tags: ["designation", "department", "new_salary"], missing_fields: [{ tag: "new_salary", label: "Offered salary", source: "manual" }] });
  vi_mock.submit.mockResolvedValue({ candidate: CANDIDATE, approval: { uuid: "ap-1" } });
  vi_mock.submitOverride.mockResolvedValue({ candidate: CANDIDATE, approval: { uuid: "ap-1" } });
});

describe("offer preparation", () => {
  it("filters out incompatible templates and prefills opening-backed values", async () => {
    setUp();
    expect(await screen.findByRole("option", { name: "Offer template" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Salary increment" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Designation")).toHaveValue("Engineer");
    expect(screen.getByLabelText("Department")).toHaveValue("Finance");
    expect(screen.getByLabelText("Offered salary")).toBeInTheDocument();
    expect(screen.queryByLabelText(/joining date/i)).not.toBeInTheDocument();
  });

  it("asks for missing required offer terms before approval and retains the form", async () => {
    const user = userEvent.setup();
    setUp();
    await screen.findByLabelText("Offered salary");
    await user.click(screen.getByRole("button", { name: /submit offer for approval/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/complete the required offer fields/i);
    expect(screen.getByLabelText("Designation")).toHaveValue("Engineer");
    expect(vi_mock.submit).not.toHaveBeenCalled();
  });

  it("blocks a failed final interview unless the user has the explicit exception permission", async () => {
    vi_mock.prepare.mockResolvedValue({ ...prep, candidate: { ...prep.candidate, final_interview_outcome: "failed" } });
    const user = userEvent.setup();
    setUp();
    expect(await screen.findByText(/final interview outcome is failed/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /submit offer for approval/i }));
    expect((await screen.findAllByText(/interview override permission/i)).length).toBeGreaterThan(0);
    expect(vi_mock.submit).not.toHaveBeenCalled();
    expect(vi_mock.submitOverride).not.toHaveBeenCalled();
  });

  it("uses one designation field and resolves both template occurrences before submission", async () => {
    const user = userEvent.setup();
    vi_mock.preview.mockResolvedValue({
      template_uuid: "tpl-offer", template_name: "Offer template",
      values: { designation: "Engineer", department: "Finance", new_salary: "150000" },
      rendered_body: "Engineer / Engineer / Finance / 150000", unresolved: [], unknown: [],
      required_tags: ["designation", "department", "new_salary"], missing_fields: [],
    });
    setUp();
    await screen.findByLabelText("Offered salary");
    expect(screen.getAllByLabelText("Designation")).toHaveLength(1);
    await user.type(screen.getByLabelText("Offered salary"), "150000");
    await user.click(screen.getByRole("button", { name: /submit offer for approval/i }));
    await waitFor(() => expect(vi_mock.submit).toHaveBeenCalledTimes(1));
    expect(vi_mock.submit).toHaveBeenCalledWith("c-1", expect.objectContaining({
      offer_template_uuid: "tpl-offer",
      offer_values: expect.objectContaining({ designation: "Engineer", department: "Finance", new_salary: "150000" }),
    }));
  });
});
