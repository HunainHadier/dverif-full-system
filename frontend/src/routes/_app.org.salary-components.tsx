import { createFileRoute, redirect } from "@tanstack/react-router";

// Backward-compatible redirect: salary components now live inside Payroll.
export const Route = createFileRoute("/_app/org/salary-components")({
  beforeLoad: () => { throw redirect({ to: "/org/payroll" }); },
});
