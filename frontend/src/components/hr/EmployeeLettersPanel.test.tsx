import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    listLetters.mockResolvedValue({ items: [draft], total: 1, totalPages: 1, page: 1 });
    removeLetter.mockResolvedValue({});
  });

  it("confirms before deleting a draft and then removes that letter", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Delete Draft" }));
    expect(screen.getByText(/will be deleted permanently/i)).toBeInTheDocument();
    expect(removeLetter).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(removeLetter).toHaveBeenCalledWith("letter-draft"));
  });
});
