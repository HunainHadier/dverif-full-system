import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { parseFeatureAccess } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/team")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/team")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "My Team — Dverif" }] }),
  component: () => <Outlet />,
});
