import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/support")({
  head: () => ({ meta: [{ title: "Support Tickets — Dverif Admin" }] }),
  component: () => <Outlet />,
});
