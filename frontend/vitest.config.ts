import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Standalone test config, deliberately NOT extending ./vite.config.ts.
 *
 * The app's Vite config loads the TanStack Start plugin, nitro and the route
 * tree generator -- all of which is irrelevant to a unit test and slow enough
 * to be worth avoiding. The only thing the tests need from it is the "@" path
 * alias, so it is declared here directly.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    /**
     * jsdom, not node.
     *
     * Component tests are what catch the bugs that TypeScript declares as
     * correct and that no unit test can see: a hook called outside its provider
     * (useFormContext returning null), a string where the type says array
     * (JSON column reaching a .map()), a provider mounted above the component
     * that reads it. All three shipped to production in this codebase before
     * component tests existed.
     *
     * Pure-logic tests do not need a DOM, but a single environment for the whole
     * run keeps the config simple and jsdom is fast enough at this suite size.
     */
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],

    /**
     * jsdom is memory-hungry, and letting vitest fork one worker per core
     * exhausted the pool and failed with "Failed to start forks worker" once the
     * component tests grew past a handful of files. Capping it costs a little
     * wall-clock and removes a whole class of non-deterministic infrastructure
     * failure.
     */
    pool: "forks",
    poolOptions: { forks: { maxForks: 2, minForks: 1 } },
  },
});
