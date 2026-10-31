import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import { ROUTE_MODULES } from "@/lib/routeModules";
import { allNavPaths } from "@/lib/navItems";
import { IMPLEMENTED_MODULE_KEYS, type ModuleFlags } from "@/services";

/**
 * The sidebar gets its "upgrade" badge from ROUTE_MODULES. If a page is gated
 * by a plan module but has no entry here, the menu renders it as an ordinary
 * link: the user clicks it, the page opens, and only then do they discover the
 * module is not in their plan. That is the exact inconsistency this test exists
 * to stop.
 *
 * The expectation is derived from the gate the PAGE actually renders, not from
 * a second hand-maintained list, so moving a page to a different module or
 * dropping its gate fails here instead of silently drifting.
 */

/** `ModuleGate module="..."` and `ModuleFeatureLockedCard feature="..."`. */
const GATE = /(?:<ModuleGate\s+module=["']|ModuleFeatureLockedCard\s+feature=["'])([a-z_]+)["']/g;

/** The route file(s) TanStack Router would generate for a path. */
function routeFilesFor(path: string): string[] {
  const base = `src/routes/_app${path.replace(/\//g, ".")}`;
  return [`${base}.tsx`, `${base}.index.tsx`].filter((file) => existsSync(file));
}

/**
 * Gates that live in a component a thin route file renders instead of the route
 * file itself. Salary components is the one page built that way today.
 */
const COMPONENT_GATES: Record<string, string[]> = {
};

function gatedModulesFor(path: string): Set<keyof ModuleFlags> {
  const files = [...routeFilesFor(path), ...(COMPONENT_GATES[path] ?? [])];
  const found = new Set<keyof ModuleFlags>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(GATE)) {
      found.add(match[1] as keyof ModuleFlags);
    }
  }
  return found;
}

describe("ROUTE_MODULES — the sidebar knows every plan-gated page", () => {
  it("maps every gated sidebar page to the module its page enforces", () => {
    for (const path of allNavPaths) {
      const gated = gatedModulesFor(path);
      if (gated.size === 0) continue;

      const mapped = ROUTE_MODULES[path];
      expect(
        mapped,
        `${path} is plan-gated (${[...gated].join(", ")}) but has no ROUTE_MODULES entry`,
      ).toBeDefined();
      expect(
        gated.has(mapped as keyof ModuleFlags),
        `${path} maps to ${mapped}, but its page gates ${[...gated].join(", ")}`,
      ).toBe(true);
    }
  });

  it("does not list a page the sidebar never renders", () => {
    const notInSidebar = Object.keys(ROUTE_MODULES).filter((p) => !allNavPaths.includes(p));
    expect(
      notInSidebar,
      `ROUTE_MODULES entries with no sidebar link: ${notInSidebar.join(", ")}`,
    ).toEqual([]);
  });

  it("does not list a page that is not plan-gated", () => {
    const notGated = Object.keys(ROUTE_MODULES).filter((p) => gatedModulesFor(p).size === 0);
    expect(notGated, `ROUTE_MODULES entries for ungated pages: ${notGated.join(", ")}`).toEqual([]);
  });

  it("matches the modules the plan editor offers", () => {
    // The plan editor must be able to toggle every module the sidebar can badge.
    // A module in one list but not the other is either an untoggleable gate or a
    // toggle that does nothing.
    const sidebarModules = [...new Set(Object.values(ROUTE_MODULES))].sort();
    expect(sidebarModules).toEqual([...IMPLEMENTED_MODULE_KEYS].sort());
  });
});
