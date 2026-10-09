import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Lets any component open the plan chooser.
 *
 * The plan picker used to live inside SubscriptionBanner, which is only rendered
 * when the whole subscription is inactive. That made it impossible for the
 * "this module isn't in your plan" prompts to do the obvious thing and offer
 * the upgrade right where the user hit the wall. With this provider, a locked
 * nav item or a locked feature card can open the same dialog directly.
 */
type PlanPickerContextValue = {
  open: boolean;
  /** Open the chooser, optionally recording which module prompted it. */
  openPicker: (module?: string) => void;
  closePicker: () => void;
  /** Optional module to highlight, so the dialog can explain the context. */
  focusModule: string | null;
  setFocusModule: (module: string | null) => void;
};

const PlanPickerContext = createContext<PlanPickerContextValue | null>(null);

export function usePlanPicker(): PlanPickerContextValue {
  const ctx = useContext(PlanPickerContext);
  // A no-op default keeps components renderable outside the provider (e.g. in
  // isolated tests) instead of throwing.
  if (!ctx) {
    return {
      open: false,
      openPicker: () => {},
      closePicker: () => {},
      focusModule: null,
      setFocusModule: () => {},
    };
  }
  return ctx;
}

/**
 * Mount once, high in the tree (the authenticated app shell). Renders nothing
 * itself -- the dialog is rendered by <PlanPickerHost /> -- so the provider can
 * sit anywhere without affecting layout.
 */
export function PlanPickerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [focusModule, setFocusModule] = useState<string | null>(null);

  const openPicker = useCallback((module?: string) => {
    setFocusModule(module ?? null);
    setOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setOpen(false);
    setFocusModule(null);
  }, []);

  const value = useMemo(
    () => ({ open, openPicker, closePicker, focusModule, setFocusModule }),
    [open, openPicker, closePicker, focusModule],
  );

  return <PlanPickerContext.Provider value={value}>{children}</PlanPickerContext.Provider>;
}
