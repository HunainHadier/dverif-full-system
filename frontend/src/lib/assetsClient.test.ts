import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Frontend-side guarantees for the assets module.
 *
 * These are the mistakes type checking cannot catch, because each one is a
 * perfectly valid value in its own right:
 *
 *  1. SENDING `status` FROM THE CLIENT. The server derives status and ignores
 *     anything posted, so a status field on a payload is a control the user can
 *     move that silently does nothing - the worst kind of bug, because it looks
 *     like it worked.
 *
 *  2. AN ACTION THE SERVER WILL REFUSE. A menu offering "Assign" on a retired
 *     asset teaches people the page is broken.
 *
 *  3. FILE HANDLING. Receipts and invoices are attachment entities uploaded as
 *     multipart. A JSON POST of a File object would upload the string
 *     "[object File]" and still report success.
 */
const ASSETS_PAGE = readFileSync("src/routes/_app.org.assets.tsx", "utf8");
const CATEGORIES_PAGE = readFileSync("src/routes/_app.org.asset-categories.tsx", "utf8");
const SERVICE = readFileSync("src/services/assets.ts", "utf8");
const ORG_SERVICE = readFileSync("src/services/org.ts", "utf8");
const NAV = readFileSync("src/lib/navItems.ts", "utf8");
const ACCESS = readFileSync("src/lib/routeAccess.ts", "utf8");
const UTILS = readFileSync("src/lib/utils.ts", "utf8");

/** Code with block and line comments stripped, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * One member of a NAMED service object.
 *
 * Scoping to the object matters: assets.ts defines both assetCategoriesService
 * and assetsService, and both have a `create`. An unscoped search finds the
 * categories one first, so the assertion quietly validated the wrong service and
 * passed no matter what assetsService did — a test that can never fail is worse
 * than no test.
 */
function member(objSrc: string, name: string): string {
  const start = objSrc.search(new RegExp(`^  ${name}:`, "m"));
  if (start === -1) return "";
  const rest = objSrc.slice(start + 1);
  const next = rest.search(/^ {2}[a-zA-Z]/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The body of a `export const <name> = { ... };` declaration, up to the next one. */
function serviceBlock(src: string, name: string): string {
  const at = src.indexOf(`export const ${name} = {`);
  if (at === -1) return "";
  const rest = src.slice(at);
  const next = rest.search(/\n};\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("edit can actually clear a field", () => {
  const PAGE = code(ASSETS_PAGE);

  it("the update service accepts null, which is the wire format for a clear", () => {
    // The server skips undefined ("field absent") and writes null ("clear this").
    // A type of `string | undefined` cannot express a clear at all, so the call
    // site had nowhere to send one even once someone noticed the bug.
    const body = member(serviceBlock(code(SERVICE), "assetsService"), "update");
    for (const field of [
      "model_details",
      "serial_number",
      "purchase_date",
      "purchase_cost",
      "vendor",
      "warranty_expires_at",
      "notes",
    ]) {
      expect(body, `update cannot clear ${field}`).toMatch(
        new RegExp(`${field}\\?:\\s*\\w+ \\| null`),
      );
    }
  });

  it("the edit branch sends null for an emptied field, not undefined", () => {
    const at = PAGE.indexOf("assetsService.update(asset.uuid, {");
    expect(at, "the update call site was not found").toBeGreaterThan(-1);
    const edit = PAGE.slice(at, at + 700);
    expect(edit).toContain("clear(values.vendor)");
    expect(edit).toContain("clear(values.notes)");
    // The bug: `values.vendor || undefined` types fine and skips server-side, so
    // clearing a vendor looked saved and the register kept the old value.
    expect(edit).not.toMatch(/values\.(vendor|notes|serial_number)\s*\|\|\s*undefined/);
  });

  it("the create branch still omits, because there is nothing to clear", () => {
    const at = PAGE.indexOf("assetsService.create({");
    expect(at, "the create call site was not found").toBeGreaterThan(-1);
    const create = PAGE.slice(at, at + 700);
    expect(create).toContain("omit(values.vendor)");
    expect(create).not.toContain("clear(values.vendor)");
  });
});

describe("filter changes cannot strand the table on a page past its end", () => {
  const PAGE = code(ASSETS_PAGE);

  it("search, status and category each reset to page 1", () => {
    // Narrowing a filter while sitting on page 4 renders an empty table, which
    // reads as "nothing matches" rather than "there is no page 4 of this".
    expect(PAGE).toMatch(/setSearch\(v\);\s*setPage\(1\);/);
    expect(PAGE).toMatch(/setStatus\([^)]*\);\s*setPage\(1\);/);
    expect(PAGE).toMatch(/setCategory\([^)]*\);\s*setPage\(1\);/);
  });
});

describe("assets client never sends status", () => {
  const ASSETS = serviceBlock(code(SERVICE), "assetsService");

  it("the assets service block was found", () => {
    // A failed lookup would make every member() below return "" and the
    // assertions vacuously pass.
    expect(ASSETS.length).toBeGreaterThan(500);
    expect(ASSETS).toContain("list:");
    expect(ASSETS).toContain("assign:");
  });

  it("create takes no status", () => {
    const body = member(ASSETS, "create");
    expect(body.length, "assetsService.create not found").toBeGreaterThan(50);
    expect(body).not.toMatch(/\bstatus\b/);
  });

  it("update takes no status", () => {
    const body = member(ASSETS, "update");
    expect(body.length, "assetsService.update not found").toBeGreaterThan(50);
    expect(body).not.toMatch(/\bstatus\b/);
  });

  it("no REQUEST body sends status, only the response type declares it", () => {
    // Scoped to inline POST bodies (assign/return/retire build theirs as object
    // literals). create/update take a `data` parameter instead, so those are
    // covered by the two tests above; a regex over the whole file would also
    // match the RESPONSE types, which legitimately contain status.
    const posts = [...ASSETS.matchAll(/\.post(?:<[^>]*>)?\([^,]+,\s*(\{[\s\S]*?\})/g)];
    expect(posts.length, "expected inline POST bodies").toBeGreaterThan(0);
    for (const [, body] of posts) {
      expect(body, `a POST body sends status: ${body.slice(0, 60)}`).not.toMatch(/\bstatus\s*:/);
    }
    expect(ASSETS).toContain("status: AssetStatus");
  });
});

describe("file uploads", () => {
  it("uploadReceipts posts multipart FormData", () => {
    const body = member(code(SERVICE), "uploadReceipts");
    expect(body).toContain("new FormData()");
    expect(body).toContain("multipart/form-data");
  });

  it("uploadInvoices posts multipart FormData", () => {
    const body = member(code(SERVICE), "uploadInvoices");
    expect(body).toContain("new FormData()");
    expect(body).toContain("multipart/form-data");
  });

  it("routes files to the attachment endpoints, never a path field", () => {
    expect(SERVICE).toContain("/org/assets/${uuid}/receipts");
    expect(SERVICE).toContain("/org/asset-maintenance/${jobUuid}/invoices");
    expect(code(SERVICE)).not.toMatch(/receipt_path|invoice_path/);
  });

  it("the attachment size uses the shared formatter, not a hand-rolled division", () => {
    // Moved into AttachmentCard when attachments became interactive. Asserted
    // where the rendering now lives: a hand-rolled "/1024 + KB" shows 0 KB for
    // anything under 512 bytes and disagrees with the uploader's own copy.
    const card = readFileSync("src/components/hr/AttachmentCard.tsx", "utf8");
    expect(card).toContain("formatFileSize(");
    expect(card).not.toMatch(/file_size\s*\/\s*1024/);
  });
});

describe("asset actions match the server's transitions", () => {
  /** The JSX branch RowActions takes for a status, matched as its own test. */
  function branchFor(status: string): string {
    // `row.status === "assigned" ||` also contains the needle, so require the
    // standalone ternary form. Without that, the first hit is the
    // "available OR assigned" edit branch and the slice is the wrong one.
    const needle = `{row.status === "${status}" ? (`;
    const at = ASSETS_PAGE.indexOf(needle);
    if (at === -1) return "";
    const rest = ASSETS_PAGE.slice(at + needle.length);
    const next = rest.indexOf('{row.status === "');
    return next > 0 ? rest.slice(0, next) : rest.slice(0, 700);
  }

  it("offers Assign and Send for maintenance only when available", () => {
    const branch = branchFor("available");
    expect(branch.length, "available branch not found").toBeGreaterThan(40);
    expect(branch).toContain("assets.assign");
    expect(branch).toContain("assets.sendForMaintenance");
  });

  it("offers Return only when assigned", () => {
    const branch = branchFor("assigned");
    expect(branch.length, "assigned branch not found").toBeGreaterThan(20);
    expect(branch).toContain("assets.returnAsset");
  });

  it("shows a placeholder, not an action, while an asset is in maintenance", () => {
    // Assigning or returning something on a repair bench would 409. The honest
    // option is to say why nothing is available.
    expect(branchFor("maintenance")).toContain("assets.inMaintenance");
    expect(branchFor("maintenance")).not.toContain("assets.assign");
  });

  it("offers Retire only when available, and Reinstate only when retired", () => {
    // retireAsset refuses an `assigned` asset ("Return this asset before retiring
    // it") and a `maintenance` one ("Close the open maintenance job before
    // retiring this asset"). The menu used to gate Retire on
    // `status !== "retired"`, so on both of those rows it offered an action whose
    // only possible outcome was a 409 - which teaches people the page is broken.
    expect(ASSETS_PAGE).not.toContain('row.status !== "retired"');
    expect(ASSETS_PAGE).toMatch(
      /\{row\.status === "available" \? \(\s*<DropdownMenuItem onSelect=\{\(\) => onDialog\("retire"\)\}/,
    );
    expect(ASSETS_PAGE).toMatch(
      /\{row\.status === "retired" \? \(\s*<DropdownMenuItem onSelect=\{\(\) => void run\(\(\) => assetsService\.reinstate/,
    );

    expect(branchFor("assigned"), "a retire action leaked into the assigned row").not.toContain(
      "assets.retire",
    );
    expect(
      branchFor("maintenance"),
      "a retire action leaked into the maintenance row",
    ).not.toContain("assets.retire");
  });

  it("reports a failed action instead of doing nothing", () => {
    // The menu's runner is called as `void run(...)`, which discards the promise.
    // With no catch, a rejected Reinstate produced zero feedback AND an unhandled
    // rejection: the button simply did nothing.
    const runner = ASSETS_PAGE.slice(
      ASSETS_PAGE.indexOf("const run = async"),
      ASSETS_PAGE.indexOf("const run = async") + 900,
    );
    expect(runner).toContain("catch");
    expect(runner).toContain("toast.error");
  });

  it("keeps the row click from also opening the drawer behind the menu", () => {
    expect(ASSETS_PAGE).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe("the Assign picker can reach the whole company", () => {
  it("asks for the org roster, not just the records this admin imported", () => {
    // By default an org_admin's employee list is filtered to what they personally
    // added, which is right for the Employees page and wrong for a picker over
    // the company: a colleague another admin onboarded was not hidden behind a
    // "show more", they were absent, so the only symptom was that the company's
    // own employees seemed not to exist.
    expect(ASSETS_PAGE).toMatch(/orgService\.employees\(\{[^}]*scope: "org"/);
  });

  it("the service can express the opt-out", () => {
    expect(ORG_SERVICE).toMatch(/scope\?:\s*"org"/);
  });
});

describe("the summary cards show the server's figures", () => {
  it("reads total_value and maintenance_spend off the summary response", () => {
    // Summing the rows on screen would report only the current page's worth: the
    // register is paginated, so a 10-page inventory would claim 1/10th of its
    // value. The server already computes both across the whole org.
    expect(ASSETS_PAGE).toContain("money?.total_value");
    expect(ASSETS_PAGE).toContain("money?.maintenance_spend");
  });

  it("does not compute a money total from the rows", () => {
    expect(ASSETS_PAGE).not.toMatch(/purchase_cost\s*\*\s*rows\.length/);
    expect(ASSETS_PAGE).not.toMatch(/rows\.reduce\([^)]*purchase_cost/);
  });

  it("says what each figure includes, so the number can be trusted", () => {
    // An unexplained total is how a register gets disbelieved: someone reconciles
    // it against the ledger, finds a difference, and stops reading the page.
    expect(ASSETS_PAGE).toContain("assets.totalValueHint");
    expect(ASSETS_PAGE).toContain("assets.maintenanceSpendHint");
  });

  it("surfaces open_jobs next to the status it explains", () => {
    // "Maintenance" for two separate faults is one problem on a dashboard and two
    // on a worklist. The count is what stops the asset being closed out after the
    // first repair.
    expect(ASSETS_PAGE).toContain("assets.openJobs");
    expect(ASSETS_PAGE).toContain("r.open_jobs");
  });
});

describe("a maintenance job can be closed either way", () => {
  it("offers Cancel as well as Mark repaired", () => {
    // Cancel is not the same as complete. With only "complete", a job raised in
    // error could only be recorded as a repair that happened - and since
    // maintenance_spend counts COMPLETED jobs, a wrongly completed job
    // permanently inflated the money the dashboard reported as spent.
    expect(ASSETS_PAGE).toContain("assets.markRepaired");
    expect(ASSETS_PAGE).toContain("assets.cancelMaintenance");
    expect(ASSETS_PAGE).toMatch(/status: "cancelled"/);
    expect(ASSETS_PAGE).toMatch(/status: "completed"/);
  });

  it("passes the transition through, rather than always sending an empty body", () => {
    const at = ASSETS_PAGE.indexOf("const closeJob = useMutation(");
    expect(at, "the closeJob mutation was not found").toBeGreaterThan(-1);
    const body = ASSETS_PAGE.slice(at, at + 400);
    expect(body).toMatch(/completeMaintenance\(/);
    expect(body).toMatch(/status: vars\.status/);
  });

  it("shows how the job closed", () => {
    // Without completion_notes a cancelled job and a completed one look identical,
    // which is the whole distinction the new button exists to record.
    expect(ASSETS_PAGE).toContain("job.completion_notes");
  });
});

describe("notes are readable, not just writable", () => {
  it("renders them in the detail drawer", () => {
    // retireAsset APPENDS "Retired: <reason>" to notes, and the edit menu item is
    // hidden for retired rows - so on a scrapped asset the drawer is the only
    // place the reason could ever appear. It rendered nowhere at all.
    expect(ASSETS_PAGE).toMatch(/\{asset\.notes \?/);
    expect(ASSETS_PAGE).toContain("whitespace-pre-wrap");
  });

  it("labels the section, rather than leaving a floating paragraph", () => {
    expect(ASSETS_PAGE).toMatch(/t\("assets\.notes"\)/);
  });
});

describe("asset category page", () => {
  it("disables delete on a category that still holds assets", () => {
    expect(CATEGORIES_PAGE).toMatch(/disabled=\{\(r\.asset_count \?\? 0\) > 0\}/);
  });

  it("surfaces a failed delete instead of closing as if it worked", () => {
    expect(CATEGORIES_PAGE).toContain("apiErrorMessage(remove.error");
  });

  it("resets the form on open, so New is not a silent overwrite", () => {
    expect(CATEGORIES_PAGE).toMatch(/wasOpen\.current/);
    expect(CATEGORIES_PAGE).toMatch(/reset\(/);
  });
});

describe("navigation and access control", () => {
  it("exposes both pages in the sidebar", () => {
    expect(NAV).toContain('to: "/org/assets"');
    expect(NAV).toContain('to: "/org/asset-categories"');
  });

  it("has a route-access row for both, or the sidebar links go nowhere", () => {
    expect(ACCESS).toContain('"/org/assets"');
    expect(ACCESS).toContain('"/org/asset-categories"');
  });

  it("lets staff move stock but reserves category admin for org_admin", () => {
    // Mirrors the backend's assetMgmt versus assetCategoryMgmt.
    expect(ACCESS).toMatch(/"\/org\/assets":\s*\{\s*roles:\s*STAFF_ROLES,/);
    expect(ACCESS).toMatch(/"\/org\/asset-categories":\s*\{\s*roles:\s*\["org_admin"\]\s*\}/);
  });

  it("gates the inventory module on manage_assets, not on role alone", () => {
    // UPDATED. This used to assert that NO feature key appeared near /org/assets, on
    // the reasoning that plan entitlement is a separate axis handled by ModuleGate.
    // That was right about module_flags and wrong about feature_access: the two are
    // different axes, and only module_flags was actually enforced. The route named a
    // ROLE and nothing else, so any sub-admin could open the inventory however their
    // feature_access was configured — which is what this audit found.
    expect(ACCESS).toMatch(/"\/org\/assets":\s*\{[^}]*feature:\s*"manage_assets"/);
    expect(ACCESS).toMatch(/"\/org\/assets":\s*\{[^}]*always:\s*\["org_admin"\]/);
  });

  it("keeps the two axes separate: module_flags for the plan, manage_assets for the user", () => {
    // The original intent survives, stated correctly this time. The feature key is
    // about WHO, not about WHETHER THE COMPANY BOUGHT THE MODULE.
    const from = ACCESS.indexOf("/org/assets");
    const block = ACCESS.slice(Math.max(0, from - 700), from + 400);
    // No key may be invented that conflates the two, e.g. "asset_management" as a
    // feature_access key when it is a module flag.
    expect(block).not.toMatch(/feature:\s*"asset_management/);
    expect(block).not.toMatch(/feature:\s*"hr_letters_management/);
  });

  it("wraps both pages in the ModuleGate for asset_management", () => {
    expect(ASSETS_PAGE).toContain('<ModuleGate module="asset_management">');
    expect(CATEGORIES_PAGE).toContain('<ModuleGate module="asset_management">');
  });
});

describe("money and date formatting", () => {
  it("never formats a cost with the date formatter", () => {
    expect(ASSETS_PAGE).not.toMatch(/formatDateTime\([^)]*cost/);
    expect(ASSETS_PAGE).toContain("formatCurrency(");
  });

  it("renders a nullish cost as a dash, not 0", () => {
    // 0 would assert a price nobody entered, and reads as a real figure in a
    // total column.
    expect(UTILS).toMatch(/value === null \|\| value === undefined[\s\S]{0,60}return "—"/);
  });

  it("the currency formatter accepts a string, because DECIMAL arrives as one", () => {
    // Whitespace-insensitive on purpose: prettier may put `value?` on its own
    // line, and a test that fails on formatting is a test that gets deleted.
    expect(UTILS.replace(/\s+/g, " ")).toMatch(
      /formatCurrency\(\s*value\?: number \| string \| null/,
    );
  });
});
