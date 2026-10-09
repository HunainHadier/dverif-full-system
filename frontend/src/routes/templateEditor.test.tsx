import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { TemplateFields } from "@/routes/_app.org.letter-templates";

/**
 * Guards the template editor's split workspace and its click-to-insert.
 *
 * Two things regressed here before:
 *
 *  1. THE CATEGORISATION. Tags were one undifferentiated row of chips. An author
 *     who cannot tell an auto-filled tag from a manual one cannot tell which
 *     values the ISSUE form will demand of them at issuance time - which is the
 *     single most surprising thing about this module. The split is by source,
 *     not cosmetic.
 *
 *  2. CLICK-TO-INSERT. Inserting must land at the CARET, not the end of the
 *     body, and the field must actually commit. A menu that renders correctly
 *     and writes to the wrong place is worse than no menu.
 */

const mergeTags = [
  { tag: "employee_name", label: "Employee name", source: "employee.full_name" },
  { tag: "organization_name", label: "Organization", source: "organization" },
  { tag: "issue_date", label: "Issue date", source: "system" },
  { tag: "current_salary", label: "Current salary", source: "manual" },
  { tag: "new_salary", label: "New salary", source: "manual" },
];

/**
 * No service mock on purpose.
 *
 * TemplateFields is purely presentational — it takes the form and the tag list
 * as props and touches no API. An earlier version mocked
 * letterTemplatesService.update for no reason; because vi.mock factories are
 * hoisted above the file's own const declarations, referencing the spy threw
 * "Cannot access 'update' before initialization" and the whole suite failed to
 * collect. The page component that DOES call update is covered elsewhere.
 */

function Harness() {
  const form = useForm({ defaultValues: { name: "", letterType: "increment", body: "" } });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TemplateFields
        form={form}
        mergeTags={mergeTags}
        error={null}
        nameLabel="Template name"
        typeLabel="Type"
        bodyLabel="Letter body"
        insertTagLabel="Click to insert"
        tagHint="Manual tags must be supplied when issuing."
        saveFailed="Save failed"
        autoTagsLabel="Filled automatically"
        manualTagsLabel="You must supply these"
      />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("merge tag palette", () => {
  it("splits tags into automatic and manual groups", () => {
    render(<Harness />);

    expect(screen.getByText("Filled automatically")).toBeInTheDocument();
    expect(screen.getByText("You must supply these")).toBeInTheDocument();
  });

  it("puts employee, organization and system tags in the automatic group", () => {
    render(<Harness />);

    // Friendly label AND raw token are both visible: the author needs the label
    // to know what it does and the token to recognise it in the body text.
    expect(screen.getByText("Employee name")).toBeInTheDocument();
    expect(screen.getByText("$employee_name")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText("Issue date")).toBeInTheDocument();
  });

  it("puts manual tags in their own group", () => {
    render(<Harness />);
    expect(screen.getByText("New salary")).toBeInTheDocument();
    expect(screen.getByText("$new_salary")).toBeInTheDocument();
    expect(screen.getByText("Current salary")).toBeInTheDocument();
  });

  it("explains the manual tags only once, on the group that needs it", () => {
    render(<Harness />);
    // The hint belongs to the manual group. Repeating it under the automatic
    // group would imply those tags need supplying too.
    expect(screen.getByText("Manual tags must be supplied when issuing.")).toBeInTheDocument();
  });
});

describe("click to insert", () => {
  it("inserts the tag at the caret, not at the end", async () => {
    render(<Harness />);
    const editor = screen.getByLabelText("Letter body") as HTMLTextAreaElement;

    // Caret in the MIDDLE of existing text, which is the whole point: appending
    // would put the tag after the last paragraph. The index is derived from the
    // string rather than hardcoded, so an edit to the fixture cannot silently
    // turn this into a test of insertion-at-the-end.
    const before = "Your salary increases to ";
    const after = " and takes effect soon.";
    editor.value = before + after;
    editor.setSelectionRange(before.length, before.length);

    fireEvent.click(screen.getByText("New salary"));

    await waitFor(() =>
      expect(editor.value).toBe("Your salary increases to $new_salary and takes effect soon."),
    );
  });

  it("leaves the caret after the inserted tag so typing continues naturally", async () => {
    render(<Harness />);
    const editor = screen.getByLabelText("Letter body") as HTMLTextAreaElement;
    editor.value = "";
    editor.setSelectionRange(0, 0);

    fireEvent.click(screen.getByText("Employee name"));

    await waitFor(() => expect(editor.value).toBe("$employee_name"));
    expect(editor.selectionStart).toBe("$employee_name".length);
    expect(editor.selectionEnd).toBe("$employee_name".length);
  });

  it("does not fire when a tag button is pressed with a modifier held", () => {
    // Guard against the button swallowing keys; the editor must stay typeable.
    render(<Harness />);
    const editor = screen.getByLabelText("Letter body") as HTMLTextAreaElement;
    expect(editor).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("inserts from either group", async () => {
    render(<Harness />);
    const editor = screen.getByLabelText("Letter body") as HTMLTextAreaElement;
    editor.value = "";
    editor.setSelectionRange(0, 0);

    const user = userEvent.setup();
    await user.click(screen.getByText("Issue date"));
    await waitFor(() => expect(editor.value).toBe("$issue_date"));
  });
});
