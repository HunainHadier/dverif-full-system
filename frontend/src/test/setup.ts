import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import i18n from "@/i18n";

/**
 * Global test setup.
 *
 * Three jobs, each of which exists because of a bug that reached production while
 * the suite was "fully green":
 *
 * 1. jest-dom matchers, so a test can assert on what the USER sees
 *    (toBeInTheDocument, toHaveTextContent) rather than on component internals.
 *    Asserting on rendered text is what catches a missing translation key — the
 *    UI renders the raw key string, and only the rendered output shows it.
 *
 * 2. i18n initialisation. Without an explicit import, t() returns the KEY, so a
 *    component test asserting on label text passes or fails depending on whether
 *    another test file happened to import i18n first. That made
 *    hrLettersActions.test.tsx pass alone and fail in the full run.
 *
 * 3. Automatic unmount, so a test that renders a dialog does not leave it mounted
 *    for the next test to query.
 */
afterEach(() => {
  cleanup();
});

/**
 * Radix's Dialog renders into a portal and reads `matchMedia`, which jsdom does
 * not implement. Any component test touching Dialog/Sheet/Popover fails without
 * this, with an error that points at the component rather than at jsdom.
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  // Radix checks for these during focus management.
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}

// Deterministic language, independent of whatever a previous test left in
// localStorage. Without this a test can assert English text and fail because an
// earlier test switched the app to Urdu.
i18n.changeLanguage("en");
