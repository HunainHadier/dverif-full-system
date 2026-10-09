/**
 * Insert text into a textarea at the caret, or append when there is no caret.
 *
 * WHY THIS IS A HELPER AND NOT AN APPEND. A template author writes
 * "Your salary increases to |" and clicks $new_salary — expecting the tag THERE.
 * Appending at the end puts it after the last paragraph, which is never what was
 * wanted. Selection matters, and after an insert the caret must sit AFTER the new
 * tag so typing continues naturally.
 *
 * WHY IT RETURNS THE STRING INSTEAD OF DISPATCHING AN INPUT EVENT. A first
 * version set element.value and dispatched `new Event("input", { bubbles: true })`.
 * That does NOT work with a controlled React input: React tracks the previous
 * value internally, so writing to .value updates its tracker and React concludes
 * nothing changed — onChange never fires, and the next render reverts the field.
 * (Setting the value through the native prototype setter does not avoid this; it
 * is the tracker's comparison that matters.)
 *
 * So: mutate the DOM for the caret, RETURN the new value, and let the caller feed
 * it to the form. For react-hook-form that is form.setValue(...), which re-renders
 * the controlled field with the right value.
 *
 * @returns the new full value, for the caller to setValue with
 */
export function insertAtCaret(
  element: HTMLTextAreaElement | HTMLInputElement | null,
  text: string,
): string {
  const current = element?.value ?? "";
  if (!element) return current + text;

  // Read the selection BEFORE touching value: assigning value collapses it.
  const start = element.selectionStart ?? current.length;
  const end = element.selectionEnd ?? start;

  const next = current.slice(0, start) + text + current.slice(end);
  element.value = next;

  // Re-apply the caret after the value write, which would otherwise have
  // collapsed it to the end.
  const caret = start + text.length;
  element.setSelectionRange(caret, caret);
  // Re-focus: clicking a chip moves focus out of the editor.
  element.focus();

  return next;
}

/**
 * Combine two refs into one callback.
 *
 * NEEDED whenever a field is registered AND needs its own ref. Spreading
 * `{...register("body")}` and then writing `ref={myRef}` in the same element
 * silently DISCARDS register()'s ref, because the later `ref` prop wins in JSX.
 * react-hook-form then never reads the DOM, believes the field is empty, and
 * re-renders it back to "" — which silently discards both typed text and any
 * programmatic insert.
 *
 * Usage:
 *   const field = form.register("body");
 *   <textarea {...field} ref={mergeRefs(field.ref, bodyRef)} />
 */
export function mergeRefs<T>(
  ...refs: Array<((instance: T | null) => void) | React.RefObject<T | null> | null | undefined>
) {
  return (instance: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(instance);
      else (ref as React.MutableRefObject<T | null>).current = instance;
    }
  };
}
