import { useEffect, useState } from "react";

/**
 * Delay propagating a rapidly-changing value.
 *
 * Used to keep a text input from driving a request per keystroke. React Query
 * keys on the value it is given, so an undebounced `values` object meant one
 * HTTP request per character typed — noisy on the server and visibly janky in
 * the UI, since the query flipped between loading and loaded mid-word.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
