import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { authStore, type AuthUser } from "@/lib/auth";

const { listLetters, removeLetter } = vi.hoisted(() => ({
  listLetters: vi.fn(),
  removeLetter: vi.fn(),
}));

vi.mock("@/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services")>();
  return {
    ...actual,
    hrLettersService: {
      ...actual.hrLettersService,
      list: listLetters,
      remove: removeLetter,
    },
    letterTemplatesService: {
      ...actual.letterTemplatesService,
      list: vi.fn(async () => ({ items: [] })),
    },
  };
});

import { EmployeeLettersPanel } from "@/components/hr/EmployeeLettersPanel";

const draft = {
  uuid: "letter-draft",
  employee_uuid: "employee-1",
  employee_name: "Asim Khan",
  reference_no: "HR/2026/0001",
  title: "Increment",
  letter_type: "increment" as const,
  status: "draft" as const,
  created_at: "2026-01-01T00:00:00Z",
  template_uuid: "template-1",
  payload: {},
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmployeeLettersPanel employeeUuid="employee-1" />
    </QueryClientProvider>,
  );
}

describe("EmployeeLettersPanel draft actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.setSession("test-access-token", {
      uuid: "org-admin",
      full_name: "Org Admin",
      email: "admin@example.com",
      role: "user",
      org_role: "org_admin",
      organization: 1,
    });
    listLetters.mockResolvedValue({ items: [draft], total: 1, totalPages: 1, page: 1 });
    removeLetter.mockResolvedValue({});
  });

  afterEach(() => authStore.clear());

  it("confirms before deleting a draft and then removes that letter", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Delete Draft" }));
    expect(screen.getByText(/will be deleted permanently/i)).toBeInTheDocument();
    expect(removeLetter).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(removeLetter).toHaveBeenCalledWith("letter-draft"));
  });

  it("does not show create, edit, issue, or delete controls with view-only access", async () => {
    const orgAdmin = authStore.get().user!;
    authStore.updateUser({
      ...orgAdmin,
      org_role: "sub_admin",
      feature_access: {
        granular_permissions: {
          "hr_letters.view": true,
          "hr_letters.create_draft": false,
          "hr_letters.edit_draft": false,
          "hr_letters.issue": false,
          "hr_letters.revoke": false,
          "hr_letters.manage_templates": false,
        },
      } as unknown as AuthUser["feature_access"],
    });
    renderPanel();

    expect(await screen.findByText("Assigned Letters")).toBeInTheDocument();
    expect(screen.queryByText("Assign a Letter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review issue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete draft/i })).not.toBeInTheDocument();
  });
});
