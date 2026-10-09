import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/hr/FormDialog";
import { insertAtCaret, mergeRefs } from "@/lib/insertAtCaret";
import { toStringArray } from "@/services";

/**
 * Covers the two bugs reported against the template editor:
 *
 *   1. "tags.slice(...).map is not a function" —” a JSON column reaching the page
 *      as a STRING.
 *   2. Clicking a merge tag chip did nothing, and an append-at-the-end
 *      implementation would insert at the wrong place for a template author who
 *      writes "increases to |" and then clicks $new_salary.
 */

describe("toStringArray —” the JSON-column guard", () => {
  it("parses the JSON string MySQL actually returns", () => {
    expect(toStringArray('["employee_name","new_salary"]')).toEqual([
      "employee_name",
      "new_salary",
    ]);
  });

  it("passes a real array through, dropping non-strings", () => {
    expect(toStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(toStringArray(["a", 1, null])).toEqual(["a"]);
  });

  it.each([
    [null, []],
    [undefined, []],
    ["", []],
    ["{}", []],
    ["not json", []],
    [42, []],
  ])("never returns a non-array for %j", (input, expected) => {
    const result = toStringArray(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(expected);
  });
});

describe("insertAtCaret", () => {
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
  });

  it("inserts at the caret rather than appending", () => {
    textarea.value = "Your salary increases to ";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const next = insertAtCaret(textarea, "$new_salary");

    expect(next).toBe("Your salary increases to $new_salary");
    expect(textarea.value).toBe("Your salary increases to $new_salary");
  });

  it("inserts mid-text, which is the whole point", () => {
    textarea.value = "Dear NAME, your salary is.";
    // Index 9 is the comma, so the tag lands before it.
    textarea.setSelectionRange(9, 9);

    insertAtCaret(textarea, "$employee_name");

    expect(textarea.value).toBe("Dear NAME$employee_name, your salary is.");
  });

  it("replaces the current selection", () => {
    textarea.value = "Dear PLACEHOLDER, welcome";
    textarea.setSelectionRange(5, 16); // exactly "PLACEHOLDER"

    insertAtCaret(textarea, "$employee_name");

    expect(textarea.value).toBe("Dear $employee_name, welcome");
  });

  it("leaves the caret AFTER the inserted text so typing continues", () => {
    textarea.value = "abc";
    textarea.setSelectionRange(3, 3);
    insertAtCaret(textarea, "$tag");
    expect(textarea.selectionStart).toBe(7);
  });

  it("does NOT dispatch a synthetic input event, which React would ignore", () => {
    // Regression guard. A controlled React input tracks its own value, so a
    // dispatched event is swallowed and the field reverts. The caller must feed
    // the returned string to form.setValue instead.
    textarea.value = "x";
    textarea.setSelectionRange(1, 1);
    let fired = 0;
    textarea.addEventListener("input", () => {
      fired += 1;
    });
    insertAtCaret(textarea, "$y");
    expect(fired).toBe(0);
  });

  it("appends when there is no element", () => {
    expect(insertAtCaret(null, "$tag")).toBe("$tag");
  });
});

/** The real shape: chips + textarea inside FormDialog. */
type Values = { name: string; body: string };

function ChipEditor({ onSave }: { onSave: (v: Values) => void }) {
  const [open] = useState(true);
  const form = useForm<Values>({ defaultValues: { name: "Increment", body: "" } });
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <FormDialog
      open={open}
      onOpenChange={() => {}}
      form={form}
      title="New template"
      submitLabel="Save"
      cancelLabel="Cancel"
      onSubmit={(v) => {
        onSave(v as Values);
        return Promise.resolve();
      }}
    >
      <Editor form={form} bodyRef={bodyRef} />
    </FormDialog>
  );
}

function Editor({
  form,
  bodyRef,
}: {
  form: UseFormReturn<Values>;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const tags = [
    { tag: "employee_name", source: "system" },
    { tag: "new_salary", source: "manual" },
  ];
  return (
    <>
      <label htmlFor="body">Letter body</label>
      <BodyField form={form} bodyRef={bodyRef} />
      {tags.map((t) => (
        <button
          key={t.tag}
          type="button"
          onClick={() => form.setValue("body", insertAtCaret(bodyRef.current, `$${t.tag}`))}
        >
          ${t.tag}
        </button>
      ))}
    </>
  );
}

/** Registered AND locally referenced — needs mergeRefs, see its doc comment. */
function BodyField({
  form,
  bodyRef,
}: {
  form: UseFormReturn<Values>;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const field = form.register("body");
  return <textarea id="body" {...field} ref={mergeRefs(field.ref, bodyRef)} />;
}

describe("merge tag chip inserts into the body", () => {
  it("inserts the tag where the caret is", async () => {
    const user = userEvent.setup();
    render(<ChipEditor onSave={vi.fn()} />);

    const body = await screen.findByLabelText("Letter body");
    await user.click(body);
    await user.type(body, "Your salary is now ");
    await user.click(screen.getByRole("button", { name: "$new_salary" }));

    expect((body as HTMLTextAreaElement).value).toBe("Your salary is now $new_salary");
  });

  it("accumulates multiple tags in click order", async () => {
    const user = userEvent.setup();
    render(<ChipEditor onSave={vi.fn()} />);

    const body = (await screen.findByLabelText("Letter body")) as HTMLTextAreaElement;
    await user.click(body);
    await user.click(screen.getByRole("button", { name: "$employee_name" }));
    await user.click(screen.getByRole("button", { name: "$new_salary" }));

    expect(body.value).toBe("$employee_name$new_salary");
  });

  it("submits the body the chips wrote, not the original empty value", async () => {
    // The end-to-end guarantee: chips must reach the submit payload, or the tag
    // appears in the editor and then vanishes on save.
    const user = userEvent.setup();
    let saved: Values | null = null;
    render(
      <ChipEditor
        onSave={(v) => {
          saved = v;
        }}
      />,
    );

    await user.click(await screen.findByLabelText("Letter body"));
    await user.click(screen.getByRole("button", { name: "$new_salary" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({ body: "$new_salary" });
  });
});
