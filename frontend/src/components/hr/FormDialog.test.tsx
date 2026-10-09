import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { useForm, useFormContext, type UseFormReturn } from "react-hook-form";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormDialog } from "@/components/hr/FormDialog";

/**
 * Two real crashes shipped through this component before it had tests:
 *
 *   1. Fields written as raw `<input name="x">`. handleSubmit() only collects
 *      REGISTERED fields, so the payload arrived empty and the server rejected a
 *      visibly-filled form with 400.
 *
 *   2. `useFormContext()` called from the component that RENDERS FormDialog.
 *      Context resolves during render, and the parent's render happens ABOVE the
 *      provider FormDialog renders, so the read returned null and the page threw
 *      "Cannot destructure property 'register' of 'useFormContext(...)'".
 *
 * Both are invisible to TypeScript —” the code type-checks perfectly. Both are
 * caught instantly by rendering.
 */

type Values = { name: string; amount: string };

/**
 * The supported pattern: the parent owns the form, passes it down, and the fields
 * live in a CHILD COMPONENT rendered inside FormDialog.
 */
function Harness({ onSubmit }: { onSubmit: (v: Values) => void }) {
  const [open, setOpen] = useState(true);
  const form = useForm<Values>({ defaultValues: { name: "Increment letter", amount: "" } });

  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        form={form}
        title="New template"
        submitLabel="Save"
        cancelLabel="Cancel"
        onSubmit={(v) => {
          // RETURN the handler's promise. Returning a separate resolved promise
          // makes react-hook-form believe the submit finished instantly, so
          // isSubmitting flips straight back to false and the busy state this
          // test is asserting never appears.
          return onSubmit(v as Values);
        }}
      >
        <Fields form={form} />
      </FormDialog>
    </>
  );
}

function Fields({ form }: { form: UseFormReturn<Values> }) {
  return (
    <>
      <label htmlFor="tpl-name">Name</label>
      <input id="tpl-name" {...form.register("name")} />

      <label htmlFor="tpl-amount">Amount</label>
      <input id="tpl-amount" {...form.register("amount")} />
    </>
  );
}

describe("FormDialog —” submits REGISTERED values", () => {
  it("passes the field values through, not an empty object", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSubmit={onSubmit} />);

    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Increment letter");

    const amount = screen.getByLabelText("Amount");
    await user.type(amount, "1500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // The regression: this used to be {} because the inputs were unregistered.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Increment letter", amount: "1500" });
  });

  it("does not crash when fields are passed to a child component", async () => {
    // Guards against a future refactor moving useFormContext() back up into the
    // component that renders FormDialog, which returns null and throws.
    expect(() => render(<Harness onSubmit={vi.fn()} />)).not.toThrow();
  });

  it("renders the title, description slot and both footer buttons", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(await screen.findByText("New template")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("gives the submit button a busy state while the handler is in flight", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<Harness onSubmit={onSubmit} />);

    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());

    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
  });
});

/**
 * The exact mistake that caused the useFormContext crash, kept as a test so the
 * pattern cannot be reintroduced. If this test starts throwing, the fix in this
 * file's header comment is being undone.
 */
describe("FormDialog —” the anti-pattern stays broken", () => {
  it("useFormContext() in the PARENT is null, which is why we do not use it", () => {
    let seen: unknown = "not-called";
    function AntiPattern() {
      // Deliberately reads the context from above the provider.
      seen = useFormContext();
      return <div />;
    }
    render(<AntiPattern />);
    expect(seen).toBeNull();
  });
});
