// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Generate static HTML via TanStack Start's built-in prerender/SPA mode
    spa: {
      enabled: true,
      maskPath: "/",
      prerender: {
        outputPath: "/index",
      },
    },
  },
  // Disable Nitro so TanStack Start uses its own build pipeline
  // and outputs to dist/client + dist/server (compatible with prerender)
  nitro: false,
});
