import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { ensureAuthenticated } from "@/lib/auth";
import "@/i18n";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <DverifLoader size="lg" fullscreen label="Loading…" />,
    // Runs once per full page load, client-side, BEFORE anything renders or
    // fires an API call: restores the in-memory access token from the httpOnly
    // refresh cookie so deep-link/hard-refresh navigation is authenticated.
    hydrate: () => ensureAuthenticated(),
  });

  return router;
};
