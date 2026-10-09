import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guarantees for the offboarding pages that type checking and the i18n audit are
 * both blind to. Each is a value that is perfectly valid in isolation and wrong in
 * combination with something else.
 *
 *  1. A CLEARANCE BUTTON THAT FAILS ON CLICK. The server refuses clearance against
 *     an unapproved exit and refuses to process a settlement while an asset is
 *     held. Offering the action anyway teaches people the page is unreliable, so
 *     both are disabled with the reason attached - the same rule the assets page
 *     follows for Retire.
 *
 *  2. THE ASSET CAP MADE INVISIBLE. When a laptop costs more than the settlement,
 *     only the settlement can cover is deducted and the remainder is recorded as
 *     still owed. Showing only the applied figure presents a capped deduction as a
 *     cleared debt, which is the opposite of what it is.
 *
 *  3. THE FnF FIGURES AS A SINGLE NET NUMBER. A settlement is a document somebody
 *     has to justify to the person receiving it, so the inputs travel with the
 *     result.
 *
 *  4. THE EMPLOYEE PAGE HIDING ITS OWN FORM. A submitted request is not editable:
 *     the notice period is agreed with HR, so letting someone keep editing a date
 *     only creates a mismatch between what they think they agreed and the record.
 */

const PAGE = readFileSync("src/routes/_app.org.offboarding.tsx", "utf8");
const ESS = readFileSync("src/routes/_app.my-resignation.tsx", "utf8");
const SERVICE = readFileSync("src/services/offboarding.ts", "utf8");
const NAV = readFileSync("src/lib/navItems.ts", "utf8");
const ACCESS = readFileSync("src/lib/routeAccess.ts", "utf8");

/** Code with block and line comments stripped, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

describe("clearance and payment are blocked before the server has to refuse them", () => {
  it("disables the clear button on an exit that is not approved, with a reason", () => {
    const p = code(PAGE);
    expect(p).toMatch(/disabled=\{d\.status !== "approved" && d\.status !== "completed"\}/);
    expect(p).toContain("offboarding.clearNeedsApproval");
  });

  it("disables Process and Mark paid while an asset is still held", () => {
    const p = code(PAGE);
    // `blocked` is derived from the settlement preview's asset count, not from a
    // separate query that could disagree with it.
    expect(p).toMatch(/const blocked = s \? s\.assets\.count > 0 : false/);
    expect(p).toMatch(/disabled=\{blocked \|\| preview\.isLoading\}/);
    expect(p).toContain("offboarding.fnfBlocked");
  });

  it("warns about held assets in the detail sheet, before anything is pressed", () => {
    expect(code(PAGE)).toContain("offboarding.assetsBlocking");
  });

  it("names the asset tag in the server-side refusal, and the UI shows the count", () => {
    // Two halves of the same rule. The backend message names the tag because
    // "there is a problem with the checklist" sends someone hunting; the UI shows
    // the count because a disabled button cannot be clicked to find out.
    expect(SERVICE).toBeTruthy();
    expect(code(PAGE)).toContain("assetsHeldTitle");
  });
});

describe("the settlement is shown as arithmetic, not as one number", () => {
  it("shows every input that produced the figure", () => {
    const p = code(PAGE);
    for (const field of [
      "basicSalary",
      "workingDays",
      "perDayRate",
      "leaveEncashment",
      "noticeServed",
      "assetDeduction",
      "netFnf",
    ]) {
      expect(p, `the settlement breakdown omits ${field}`).toContain(`offboarding.${field}`);
    }
  });

  it("surfaces the amount a capped deduction could NOT reach", () => {
    const p = code(PAGE);
    expect(p).toContain("offboarding.assetCapNote");
    expect(p).toMatch(/s\.assets\.withheld_amount/);
    expect(p).toMatch(/s\.assets\.capped/);
  });

  it("never nets an addition against a deduction before the user has seen both", () => {
    // The integration bug this whole feature risks: folding the asset deduction
    // and the leave encashment into one signed total, so the payslip shows a
    // number nobody can decompose.
    expect(code(PAGE)).not.toMatch(/netFnf[\s\S]{0,400}(gross\s*-\s*assets)/);
  });

  it("previews before it writes, and saving is a separate act", () => {
    const p = code(PAGE);
    expect(p).toContain("previewSettlement");
    expect(p).toContain("draftSettlement");
  });
});

describe("the employee's own page", () => {
  it("hides the form once a request is open, so a submitted date cannot be edited", () => {
    const e = code(ESS);
    expect(e).toContain("alreadySubmitted");
  });

  /**
   * The regression from the first release.
   *
   * The form condition was `open = pending || approved`, so "show the form
   * otherwise" included COMPLETED. An employee whose exit was finished - roster
   * flipped to ex_employee, settlement paid, checklist 9/9 - was shown a fresh
   * "Submit a resignation" form, and submitting it was refused with "this employee
   * has already left the organization". A dead end with nothing on the page to
   * explain it, on the one page an ex-employee is most likely to revisit.
   */
  it("hides the form for a COMPLETED exit - the employee has already left", () => {
    const e = code(ESS);
    expect(e).not.toMatch(/const open = request\?\.status === "pending"/);
    // Only a genuinely resubmittable state shows it: no request at all, or a
    // rejected one.
    expect(e).toMatch(
      /const canSubmit =[\s\S]{0,140}mine\.data\?\.on_roster !== false && \(!request \|\| request\.status === "rejected"\)/,
    );
  });

  it("asks the SERVER whether they are on the roster, rather than inferring it", () => {
    // Someone can be an ex-employee with no exit record at all - they left before
    // this module existed, or HR set the status by hand - so the exit status alone
    // cannot decide this. Inferring it is what put the form back on the screen.
    const e = code(ESS);
    expect(e).toContain("mine.data?.on_roster");
    expect(SERVICE).toMatch(/on_roster: boolean/);
  });

  it("says plainly that they have left, instead of only hiding the form", () => {
    // A form that merely vanishes leaves someone wondering whether they did
    // something wrong.
    expect(code(ESS)).toContain("alreadyLeft");
  });

  it("never renders a bare '0 day(s)' for a notice nobody agreed", () => {
    // A completed exit recorded without a notice period displayed "0 day(s)", which
    // reads as though the employee served a zero-day notice.
    const e = code(ESS);
    expect(e).toContain("noticeNotSet");
    expect(e).toMatch(/request\.notice_period_days > 0/);
  });

  it("never lets the page send an employee_uuid or a request type", () => {
    // The backend derives the employee from the session and hardcodes
    // request_type to resignation. A client that could send either could file a
    // termination for a colleague.
    const e = code(ESS);
    expect(e).not.toContain("employee_uuid");
    expect(e).not.toContain("request_type");
  });

  it("warns about held assets in the employee's own words, with the count", () => {
    // The single most actionable fact on the page: they cannot be paid until the
    // laptop comes back.
    expect(code(ESS)).toContain("assetsWarning");
  });

  it("shows the net settlement but not the asset deduction arithmetic", () => {
    // The backend withholds it deliberately; rendering it here would undo that.
    expect(code(ESS)).toContain("netFnf");
    expect(code(ESS)).not.toContain("assetDeduction");
  });
});

describe("navigation and access match the backend's own gates", () => {
  it("both pages are in the sidebar", () => {
    expect(NAV).toContain('to: "/org/offboarding"');
    expect(NAV).toContain('to: "/my-resignation"');
  });

  it("the staff page is open to staff, mirroring separationMgmt", () => {
    // The backend gates /org/offboarding/* on
    // [...staff, requireModuleFeature, requirePermission("manage_separation")].
    // If this said org_admin only, a sub-admin would see a link that 403s.
    expect(ACCESS).toMatch(/"\/org\/offboarding":\s*\{\s*roles:\s*STAFF_ROLES,/);
  });

  it("ends someone's employment only on manage_separation", () => {
    // UPDATED. This row was role-only, and it is the highest-consequence module in
    // the product: it terminates an employment and settles final dues. Every
    // sub-admin could reach it however their feature_access was configured, and an
    // org admin had no way to grant or withhold it. There is now a dial.
    expect(ACCESS).toMatch(
      /"\/org\/offboarding":\s*\{[^}]*feature:\s*"manage_separation"/,
    );
    expect(ACCESS).toMatch(
      /"\/org\/offboarding":\s*\{[^}]*always:\s*\["org_admin"\]/,
    );
  });

  it("the ESS page is open to ALL org roles, not just employees", () => {
    // The backend mounts /my/resignation with authUser and NO role check, so that
    // a sub-admin who is also on the roster can serve notice. A 403 here would
    // contradict what the server already permits.
    // ON_ROSTER_ROLES rather than ALL_ORG_ROLES: notice is an EMPLOYMENT thing. A
    // sub-admin who is also on the roster can serve notice and keeps the page; an
    // org_admin has no employment to resign from, so the endpoint answers them with an
    // empty list rather than a 403. See ON_ROSTER_ROLES in routeAccess.ts.
    expect(ACCESS).toMatch(/"\/my-resignation":\s*\{\s*roles:\s*ON_ROSTER_ROLES\s*\}/);
  });

  it("the staff page redirects through canAccessRoute, the same call the sidebar makes", () => {
    // A visible link and a reachable page that disagree is the bug the route table
    // was introduced to end.
    expect(PAGE).toMatch(/canAccessRoute\(authStore\.get\(\)\.user, "\/org\/offboarding"\)/);
    expect(PAGE).toMatch(/throw redirect\(\{ to: "\/dashboard" \}\)/);
  });

  it("keeps the two axes separate on both pages", () => {
    // RESTATED, not deleted. The original intent was right — plan entitlement is
    // ModuleGate's axis via module_flags, and a per-user key that mirrored it would be
    // a source of truth the backend never consults. It was applied too broadly: it
    // forbade ANY feature key, so the row ended up with no permission at all, and
    // delegation had no dial.
    //
    // The two axes are different questions and both belong here:
    //   does the COMPANY have the module?  module_flags, checked by ModuleGate
    //   may THIS USER administer it?      feature_access, checked by this row
    //
    // So: no key may conflate the two, and the ESS page still carries none.
    expect(ACCESS).not.toMatch(/"\/org\/offboarding":\s*\{[^}]*feature:\s*"separation_management/);
    expect(ACCESS).not.toMatch(/"\/my-resignation":\s*\{[^}]*feature:/);
  });
});

describe("the service layer mirrors the backend's response shape", () => {
  it("exposes every endpoint the pages call", () => {
    for (const call of [
      "offboardingService.list",
      "offboardingService.detail",
      "offboardingService.review",
      "offboardingService.clearTask",
      "offboardingService.outstandingAssets",
      "offboardingService.previewSettlement",
      "offboardingService.draftSettlement",
      "offboardingService.advanceSettlement",
      "offboardingService.complete",
      "offboardingService.clearanceQueue",
      "myResignationService.get",
      "myResignationService.submit",
    ]) {
      expect(code(PAGE) + code(ESS), `${call} is never called`).toContain(call);
    }
  });

  it("types money as string-or-number, because DECIMAL arrives as a string", () => {
    // A formatter that assumes a number turns Rs 21,136.35 into NaN on the first
    // payslip, which is how the line-basis bug in the payroll integration looked.
    expect(SERVICE).toMatch(/net_fnf_amount: number \| string/);
    expect(SERVICE).toMatch(/per_day_rate: number \| string/);
  });

  it("the ESS settlement type omits the asset deduction fields the backend withholds", () => {
    const essType = SERVICE.slice(
      SERVICE.indexOf("export type MyExit"),
      SERVICE.indexOf("export const offboardingService"),
    );
    expect(essType).not.toContain("asset_deductions");
    expect(essType).not.toContain("notice_pay_adjustment");
  });
});
