import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Guards the two things the actions menu must never get wrong:
 *
 *   1. WHICH actions a status offers. A draft must not offer "Revoke", and a
 *      revoked letter must not offer "Issue" — offering it would ask the user to
 *      fill in a form only for the backend to reject the request with 409.
 *
 *   2. THAT the rows call the API. A menu that renders and then silently does
 *      nothing is exactly the failure the previous icon-only column had, so each
 *      click is asserted against the service.
 *
 * Mocks @/services rather than axios: it is the seam this component actually
 * uses, and mocking below it would make the test brittle against the axios
 * interceptor chain.
 */

const issue = vi.fn(async () => ({}) as never);
const revoke = vi.fn(async () => ({}) as never);
const remove = vi.fn(async () => ({}) as never);
const revertToDraft = vi.fn(async () => ({}) as never);
const downloadPdf = vi.fn(async () => new Blob(["pdf"]));

/**
 * Reports $new_salary as missing until a value is supplied for it, then resolves
 * it. Modelling this is the point of the test: the dialog's submit button is
 * gated on the SERVER's `unresolved` list, so a stub that always reports the tag
 * missing would prove nothing.
 *
 * Named so beforeEach can re-install it: a test that swaps in a slower variant
 * would otherwise leak into every test after it.
 */
const previewImpl = async (_uuid: string, data: { values?: Record<string, string> }) => {
  const given = data.values?.new_salary?.trim();
  const unresolved = given ? [] : ["new_salary"];
  return {
    text: `Dear Asim Khan,\n\nYour new salary is ${given ?? "$new_salary"}.`,
    unresolved,
    unknown: [],
    missing_manual: unresolved,
  };
};
const preview = vi.fn(previewImpl);

vi.mock("@/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services")>();
  return {
    ...actual,
    hrLettersService: {
      ...actual.hrLettersService,
      issue,
      revoke,
      remove,
      revertToDraft,
      downloadPdf,
    },
    letterTemplatesService: { ...actual.letterTemplatesService, preview },
  };
});

const { RowActions } = await import("@/routes/_app.org.hr-letters");

const base = {
  reference_no: "HR/2026/0001",
  letter_type: "increment" as const,
  employee_uuid: "e1",
  employee_name: "Asim Khan",
  title: "Increment",
  created_at: "2026-01-01T00:00:00Z",
};

const draft = {
  ...base,
  uuid: "l2",
  status: "draft" as const,
  verify_url: null,
  issued_at: null,
  template_uuid: "tpl1",
  payload: {},
};
const issued = {
  ...base,
  uuid: "l1",
  status: "issued" as const,
  verify_url: "https://www.dverif.com/verify/letter/abc",
  issued_at: "2026-01-05T00:00:00Z",
};
const revoked = {
  ...base,
  uuid: "l3",
  status: "revoked" as const,
  verify_url: null,
  issued_at: null,
};

function Harness() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <table>
        <tbody>
          <tr>
            <td>
              <RowActions row={draft} />
            </td>
          </tr>
          <tr>
            <td>
              <RowActions row={issued} />
            </td>
          </tr>
          <tr>
            <td>
              <RowActions row={revoked} />
            </td>
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockReset, not just clearAllMocks: clear leaves the implementation intact,
  // so a test that swapped in a slow preview would decide the tests after it.
  preview.mockReset();
  preview.mockImplementation(previewImpl);
});

/** Open one row's dropdown; returns the user so the caller can keep clicking. */
async function openRow(index: number) {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole("button", { name: /actions/i })[index]);
  return user;
}

describe("actions offered per status", () => {
  it("draft offers Issue and Delete Draft, and nothing else", async () => {
    render(<Harness />);
    await openRow(0);

    await waitFor(() => expect(screen.getByText("Issue Letter")).toBeInTheDocument());
    expect(screen.getByText("Delete Draft")).toBeInTheDocument();
    expect(screen.queryByText("Revoke letter")).not.toBeInTheDocument();
    expect(screen.queryByText("Download PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("View verification page")).not.toBeInTheDocument();
  });

  it("issued offers Download, View Verification and Revoke", async () => {
    render(<Harness />);
    await openRow(1);

    await waitFor(() => expect(screen.getByText("Download PDF")).toBeInTheDocument());
    expect(screen.getByText("View verification page")).toBeInTheDocument();
    expect(screen.getByText("Revoke letter")).toBeInTheDocument();
    expect(screen.queryByText("Issue Letter")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete Draft")).not.toBeInTheDocument();
  });

  it("revoked offers only the watermarked download", async () => {
    render(<Harness />);
    await openRow(2);

    await waitFor(() => expect(screen.getByText("Download PDF (Revoked)")).toBeInTheDocument());
    expect(screen.queryByText("Revoke letter")).not.toBeInTheDocument();
    expect(screen.queryByText("Issue Letter")).not.toBeInTheDocument();
  });

  it("revoked offers a way back to draft, since revocation was one-way", async () => {
    render(<Harness />);
    await openRow(2);

    await waitFor(() => expect(screen.getByText("Revert to Draft")).toBeInTheDocument());
  });
});

describe("actions call the service", () => {
  it("keeps the input mounted while typing, so a full value can be entered", async () => {
    render(<Harness />);
    const user = await openRow(0);

    await waitFor(() => expect(screen.getByText("Issue Letter")).toBeInTheDocument());
    await user.click(screen.getByText("Issue Letter"));

    const input = await screen.findByLabelText("New salary");

    // Type one character at a time. Regression guard: the first character used
    // to satisfy the tag, the preview refetched with missing_manual: [], and the
    // input unmounted — so only one digit was ever accepted.
    fireEvent.change(input, { target: { value: "8" } });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("New salary")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New salary"), { target: { value: "85" } });
    expect(screen.getByLabelText("New salary")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New salary"), { target: { value: "85000" } });
    await waitFor(() => expect(screen.getByLabelText("New salary")).toHaveValue("85000"));

    // Still the same element instance, not a remount that lost focus.
    expect(screen.getByLabelText("New salary")).toBe(input);
  });

  it("keeps the preview text on screen while a new preview loads", async () => {
    render(<Harness />);
    const user = await openRow(0);

    await waitFor(() => expect(screen.getByText("Issue Letter")).toBeInTheDocument());
    await user.click(screen.getByText("Issue Letter"));

    await screen.findByLabelText("New salary");
    // Text the user can already read; it must not be replaced by a spinner
    // between keystrokes.
    await waitFor(() => expect(screen.getByText(/Your new salary is/)).toBeInTheDocument());

    // Slow the preview down so the in-flight window is observable.
    preview.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                text: "Dear Asim Khan,\n\nYour new salary is 9.",
                unresolved: [],
                unknown: [],
                missing_manual: [],
              }),
            150,
          ),
        ),
    );

    fireEvent.change(screen.getByLabelText("New salary"), { target: { value: "9" } });

    // Wait for the debounce to elapse and the fetch to actually start, then
    // assert mid-flight: previous text still present, no spinner in its place.
    await waitFor(() => expect(screen.getByText("Updating...")).toBeInTheDocument());
    expect(screen.getByText(/Your new salary is/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/Your new salary is 9\./)).toBeInTheDocument());
  });

  it("does not fire one preview request per keystroke", async () => {
    render(<Harness />);
    const user = await openRow(0);

    await waitFor(() => expect(screen.getByText("Issue Letter")).toBeInTheDocument());
    await user.click(screen.getByText("Issue Letter"));

    const input = await screen.findByLabelText("New salary");
    preview.mockClear();

    // Five keystrokes inside the debounce window must collapse to one request.
    for (const v of ["1", "12", "123", "1234", "12345"]) {
      fireEvent.change(input, { target: { value: v } });
    }
    await waitFor(() => expect(preview).toHaveBeenCalled(), { timeout: 2000 });
    expect(preview.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("Issue Letter opens a form to collect missing values, then issues with them", async () => {
    render(<Harness />);
    const user = await openRow(0);

    await waitFor(() => expect(screen.getByText("Issue Letter")).toBeInTheDocument());
    await user.click(screen.getByText("Issue Letter"));

    // The draft's template needs $new_salary, so Issue must NOT have fired yet.
    await waitFor(() => expect(screen.getByText("New salary")).toBeInTheDocument());
    expect(issue).not.toHaveBeenCalled();

    const input = screen.getByLabelText("New salary");
    // fireEvent, not user.type: Radix's scroll lock sets pointer-events:none on
    // <body> while the dialog is open, which stalls userEvent after one
    // character. The behaviour under test is "the collected values are sent",
    // not per-keystroke rendering.
    fireEvent.change(input, { target: { value: "85000" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /issue letter/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /issue letter/i }));

    // draft.uuid, not the issued or revoked row's — proves the row is wired to
    // its own record rather than a closure over a shared value.
    await waitFor(() => expect(issue).toHaveBeenCalledWith("l2", { new_salary: "85000" }));
  });

  it("Download requests that row's PDF", async () => {
    render(<Harness />);
    const user = await openRow(1);

    await waitFor(() => expect(screen.getByText("Download PDF")).toBeInTheDocument());
    await user.click(screen.getByText("Download PDF"));

    await waitFor(() => expect(downloadPdf).toHaveBeenCalledWith("l1"));
  });

  it("Revoke confirms first — it is irreversible", async () => {
    render(<Harness />);
    const user = await openRow(1);

    await waitFor(() => expect(screen.getByText("Revoke letter")).toBeInTheDocument());
    await user.click(screen.getByText("Revoke letter"));

    await waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument());
    expect(revoke).not.toHaveBeenCalled();
  });

  it("Delete Draft confirms before deleting", async () => {
    render(<Harness />);
    const user = await openRow(0);

    await waitFor(() => expect(screen.getByText("Delete Draft")).toBeInTheDocument());
    await user.click(screen.getByText("Delete Draft"));

    await waitFor(() => expect(screen.getByText(/never been issued/i)).toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
  });
});
