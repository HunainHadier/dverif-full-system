import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards the two UI problems from the last round, both of which type checking
 * and the i18n audit were blind to.
 *
 * 1. THE DETAIL PANEL. It was built on `Drawer`, which is vaul - a MOBILE BOTTOM
 *    SHEET. It ignores `w-full max-w-*`, slides up from the bottom edge, and on a
 *    narrow viewport the panel was clipped off-screen with no reachable close
 *    control. `Sheet` is the Radix side-panel primitive and is the correct
 *    choice for a desktop slide-over.
 *
 * 2. THE DIALOG INTERPOLATION. i18next reads {{name}}. A single-brace {name} is
 *    ICU syntax it parses and leaves alone, so the template rendered literally as
 *    Delete "{name}"?. The key existed in both locale files and parity was 100%,
 *    so nothing caught it.
 *
 * Both are asserted textually because neither is visible to any other kind of
 * check: the panel's geometry and a string that is correct until rendered.
 */
const ASSETS = readFileSync("src/routes/_app.org.assets.tsx", "utf8");
const MY_ASSETS = readFileSync("src/routes/_app.my-assets.tsx", "utf8");
const CATEGORIES = readFileSync("src/routes/_app.org.asset-categories.tsx", "utf8");
const SHEET = readFileSync("src/components/ui/sheet.tsx", "utf8");
const NAV = readFileSync("src/lib/navItems.ts", "utf8");
const ACCESS = readFileSync("src/lib/routeAccess.ts", "utf8");
const SERVICE = readFileSync("src/services/assets.ts", "utf8");

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("asset detail panel is a real side panel", () => {
  it("uses Sheet, not the vaul Drawer", () => {
    // vaul is a bottom sheet. Its width classes are ignored, which is what
    // pushed the panel off-screen.
    expect(code(ASSETS)).toContain("<Sheet");
    expect(code(ASSETS)).toContain("<SheetContent");
    const imported = ASSETS.match(/from "@\/components\/ui\/drawer"/);
    expect(imported, "the assets page still imports the vaul Drawer").toBeNull();
  });

  it("pins the panel to the right edge at a readable width", () => {
    // max-w-lg, not the Sheet default sm:max-w-sm: the custody history and
    // receipt rows are two-column and unusable at the narrower width.
    expect(ASSETS).toMatch(/<SheetContent[^>]*side="right"/);
    expect(ASSETS).toMatch(/max-w-lg/);
  });

  it("scrolls inside the panel, not the page behind it", () => {
    expect(ASSETS).toMatch(/<SheetContent[^>]*overflow-y-auto/);
  });

  it("has an accessible, translated close affordance", () => {
    // Sheet renders its own close button; its label must be translated or a
    // screen-reader user gets untranslated English in the Urdu UI.
    expect(SHEET).toContain("<SheetPrimitive.Close");
    expect(SHEET).toMatch(/<span className="sr-only">\{t\("common\.close"\)\}<\/span>/);
    expect(SHEET).not.toMatch(/<span className="sr-only">Close<\/span>/);
  });

  it("clears the open asset when the panel closes", () => {
    // Otherwise reopening the same row is a no-op, because uuid never changed.
    expect(ASSETS).toContain("onOpenChangeClose");
    expect(ASSETS).toMatch(/onOpenChangeClose=\{\(\) => setDetailUuid\(null\)\}/);
  });

  it("does not refresh the table just because the panel was closed", () => {
    // Closing is not a mutation. Calling onChanged made the list flicker every
    // time someone glanced at an asset.
    const handler = ASSETS.slice(
      ASSETS.indexOf("onOpenChangeClose();") - 400,
      ASSETS.indexOf("onOpenChangeClose();"),
    );
    expect(handler).not.toContain("onChanged()");
  });
});

describe("interpolation reaches the screen", () => {
  it("the delete-category key uses double braces", () => {
    const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
    expect(en.assets.deleteCategoryWarning).toBe('Delete "{{name}}"?');
    expect(en.assets.deleteCategoryWarning).not.toMatch(/(?<!\{)\{name\}(?!\})/);
  });

  it("the detail-description key uses double braces", () => {
    const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
    expect(en.assets.detailDescription).toBe("Category: {{category}}");
  });

  it("the caller passes the variable the template names", () => {
    // A template saying {{category}} fed with { asset } renders the literal.
    expect(ASSETS).toMatch(/t\("assets\.detailDescription",\s*\{\s*category:/);
    expect(CATEGORIES).toMatch(/t\("assets\.deleteCategoryWarning",\s*\{\s*name:/);
  });
});

describe("/my-assets", () => {
  it("is read only, with no mutation controls", () => {
    // Assign/return/retire are HR actions; offering them here would both be
    // wrong and be refused by the server.
    for (const action of ["assign", "return", "retire", "reinstate", "reportMaintenance"]) {
      expect(code(MY_ASSETS)).not.toContain(`${action}(`);
    }
  });

  it("shows the five fields the employee needs", () => {
    for (const header of [
      "assets.tag",
      "assets.category",
      "assets.serialNumber",
      "assets.assignedDate",
    ]) {
      expect(MY_ASSETS, `column header ${header} missing`).toContain(header);
    }
    // Model details render in the name cell.
    expect(MY_ASSETS).toContain("model_details");
  });

  it("calls the session-scoped endpoint with no parameters", () => {
    expect(SERVICE).toContain('"/my/assets"');
    // A parameter here would be a way to ask about a colleague.
    expect(SERVICE).not.toMatch(
      /list:\s*\([^)]*[a-zA-Z]+[^)]*\)\s*=>\s*\n?\s*api\.get<[^>]*>\("\/my\/assets"/,
    );
  });

  it("uses a distinct type that cannot carry procurement figures", () => {
    // MyAsset is narrower than Asset on purpose: cost and vendor must not be
    // reachable from an employee view even by accident.
    expect(SERVICE).toMatch(/export type MyAsset = \{/);
    const my = SERVICE.slice(
      SERVICE.indexOf("export type MyAsset = {"),
      SERVICE.indexOf("export type MyAsset = {") + 500,
    );
    expect(my).not.toContain("purchase_cost");
    expect(my).not.toContain("vendor");
    expect(my).not.toContain("notes");
  });

  it("is reachable by staff and employees alike", () => {
    expect(NAV).toContain('to: "/my-assets"');
    // ON_ROSTER_ROLES rather than ALL_ORG_ROLES: a sub-admin on the roster really has
    // been handed a laptop, so they keep the page. An org_admin is not on the payroll
    // and has no assignment, so the endpoint answers them with an empty list.
    expect(ACCESS).toMatch(/"\/my-assets":\s*\{\s*roles:\s*ON_ROSTER_ROLES\s*\}/);
  });

  it("sits in the employee self-service nav list, beside my-letters", () => {
    const members = NAV.slice(
      NAV.indexOf("export const memberNavItems"),
      NAV.indexOf("export const orgAdminNavItems"),
    );
    expect(members).toContain('to: "/my-assets"');
    expect(members).toContain('to: "/my-letters"');
  });

  it("is wrapped in the ModuleGate for asset_management", () => {
    expect(MY_ASSETS).toContain('<ModuleGate module="asset_management">');
  });

  it("tells an employee what to do about a discrepancy", () => {
    // An empty state that is indistinguishable from a broken query leaves
    // someone whose laptop is missing with no next step.
    expect(MY_ASSETS).toContain("myAssets.reportIssue");
  });
});

/**
 * The assign dialog and the employee page can disagree without either being wrong,
 * which is exactly the failure this module had. /my/assets resolves the employee
 * FROM the session, via employees.linked_user_uuid. So assigning to an employee
 * who has no portal account produces a perfect assignment - visible in every staff
 * view, stock decremented, audit trail intact - that the holder can never see.
 */
describe("assigning to an employee who cannot see the result", () => {
  it("warns when the chosen employee has no portal account", () => {
    // Keyed off linked_user_uuid, the same field the endpoint joins on. A warning
    // keyed off anything else (status, is_platform_user) would be wrong.
    expect(code(ASSETS)).toContain("linked_user_uuid");
    expect(code(ASSETS)).toContain("chosenHasNoAccount");
    expect(ASSETS).toContain("assets.assignNoPortalAccount");
  });

  it("marks such employees in the picker rather than hiding them", () => {
    // Hiding them would look like success and silently reintroduce the bug; the
    // assignment is legitimate, only the visibility is missing.
    expect(ASSETS).toContain("assets.noPortalAccount");
    expect(code(ASSETS)).toContain("assignable");
  });

  it("asks the server, so the flag cannot drift from the endpoint's own join", () => {
    // The backend reads linked_user_uuid inside the assign transaction, so a
    // value cached in the page can never go stale mid-dialog.
    expect(SERVICE).toContain("employee_has_portal_account");
  });
});

describe("the employee picker cannot silently truncate the roster", () => {
  it("does not request a page size the API would refuse", () => {
    // parsePagination caps at maxLimit 100, so "limit: 200" returned 100 and
    // everyone past that was missing from the picker with no indication.
    const limit = ASSETS.match(/orgService\.employees\(\{[^}]*limit:\s*(\d+)/)?.[1];
    expect(limit, "the picker page size could not be found").toBeDefined();
    expect(Number(limit), `limit ${limit} exceeds the API maxLimit of 100`).toBeLessThanOrEqual(100);
  });

  it("says so when the roster is larger than the fetched page", () => {
    // Without this a capped list reads as the whole company, and someone gets
    // told "that employee is not in the system" when they simply were not fetched.
    expect(ASSETS).toContain("assets.employeesTruncated");
  });

  it("is searchable, so a large roster is reachable without paging", () => {
    expect(ASSETS).toContain("assets.searchEmployees");
    expect(code(ASSETS)).toContain("employeeQuery");
  });
});
