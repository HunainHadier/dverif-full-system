import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;

    const { token, user } = authStore.get();
    if (!token) throw redirect({ to: "/login" });

    // One question, one table, for every page under this layout. The sidebar
    // asks it through the same canAccessRoute() when deciding what to render.
    //
    // This replaces a stack of overlapping `if (location.pathname...)` blocks
    // that each re-derived the rule by hand. They overlapped in a way that made
    // one of them unreachable: the `/org/support` case allowed any org user,
    // but the very next block re-tested the same pathname against the stricter
    // `startsWith("/org/")` staff-only rule, so an employee who clicked Support
    // was silently redirected to the dashboard and the page never opened.
    // Sequential ifs cannot express "this exception", only "and also" -- which
    // is exactly the shape that produced the bug.
    if (!canAccessRoute(user, location.pathname)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
