import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Frontend-side guarantees for the expenses module.
 *
 * The pattern is the same one assetsClient.test.ts established: assert on the
 * SOURCE, because each failure below is a value that is perfectly valid in its own
 * right and therefore invisible to both typecheck and the unit tests.
 *
 * The three that matter most are the first three. A reimbursement module has one
 * unforgivable failure — money leaving the company for the wrong person or twice —
 * and every one of them is reachable from a frontend change that types fine.
 */
const ORG_PAGE = readFileSync("src/routes/_app.org.expense-claims.tsx", "utf8");
const ESS_PAGE = readFileSync("src/routes/_app.my-expenses.tsx", "utf8");
const SERVICE = readFileSync("src/services/expenses.ts", "utf8");
const NAV = readFileSync("src/lib/navItems.ts", "utf8");
const ACCESS = readFileSync("src/lib/routeAccess.ts", "utf8");
const CARD = readFileSync("src/components/hr/AttachmentCard.tsx", "utf8");

/** Code with block and line comments stripped, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * The body of a `export const <name> = { ... };` declaration, up to the next one.
 *
 * Scoped to the object on purpose. expenses.ts defines three services with
 * overlapping member names — all three have a `create`, and two have a
 * `removeAttachment`. An unscoped search finds the first one and every assertion
 * quietly validates the wrong service, which is worse than no test at all.
 *
 * `\r?\n`, not `\n`. This repo is checked out with core.autocrlf=true, so on a
 * Windows working tree the terminator is `};\r\n` and a `\n};\n` search matches
 * NOTHING — search() returns -1, the fallback returns the REST OF THE FILE, and
 * every assertion below silently starts reading the other two services too. That
 * is not a theoretical failure: it made this suite report a phantom `create` in
 * expenseClaimsService, i.e. it would have failed a correct restriction as though
 * the removal had been reverted. A helper that silently degrades on a line ending
 * is worse than no helper.
 */
function serviceBlock(src: string, name: string): string {
  const at = src.indexOf(`export const ${name} = {`);
  if (at === -1) return "";
  const rest = src.slice(at);
  const next = rest.search(/\r?\n};\r?\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

// ---------------------------------------------------------------------------
// 1. Nobody can file a claim for somebody else
// ---------------------------------------------------------------------------

describe("an employee can only ever file a claim for themselves", () => {
  const ESS = serviceBlock(code(SERVICE), "myExpensesService");

  it("the self-service service block was found", () => {
    // A failed lookup would make every assertion below vacuously pass.
    expect(ESS.length).toBeGreaterThan(300);
    expect(ESS).toContain("create:");
  });

  it("myExpensesService has no employee_uuid anywhere", () => {
    // THE guarantee. The server derives the employee from the session, so the
    // client has nothing to send and nothing to get wrong. A field here would be
    // an invitation to point the form at a colleague, and the company would pay
    // their taxi.
    expect(ESS).not.toMatch(/employee_uuid/);
    // Its create payload must not even accept one.
    const at = ESS.indexOf("create:");
    const body = ESS.slice(at, at + 400);
    expect(body).not.toMatch(/employee_uuid/);
  });

  it("the ESS page never sends an employee_uuid", () => {
    expect(code(ESS_PAGE)).not.toMatch(/employee_uuid/);
  });

  it("the ESS page has no employee picker to point a form somewhere else", () => {
    // Defense in depth on the same property: even a well-typed form cannot open
    // an employee select here.
    expect(ESS_PAGE).not.toMatch(/<Select[\s\S]{0,200}employee/i);
  });

  it("the STAFF service cannot name an employee, because it cannot file at all", () => {
    // UPDATED. This used to assert the opposite — that the staff client took an
    // employee_uuid, because finance used to type claims up for colleagues. That
    // capability is now the bug: the staff server gate makes an org_admin
    // unconditionally `approve_expenses`, so a staff create route let the single
    // account that can approve any reimbursement also originate one. POST
    // /org/expense-claims is unregistered, so the client that called it is gone
    // rather than merely unused — a method that 404s is a trap for whoever wires
    // up a button next.
    const STAFF = serviceBlock(code(SERVICE), "expenseClaimsService");
    expect(STAFF).not.toMatch(/\bcreate\b/);
    // The bare path survives as the LIST (a GET), which is how finance pulls up
    // one employee's queue. What must not exist is a POST to it — that is the
    // creation call, and the one the server no longer routes.
    expect(STAFF).toMatch(/get<Paginated<ExpenseClaim>>\("\/org\/expense-claims"/);
    expect(STAFF).not.toMatch(/\.post(?:<[^>]*>)?\([^)]*"\/org\/expense-claims"/);

    // employee_uuid SURVIVES, and deliberately: it is the list filter, so finance
    // can pull up one employee's queue. Reading a roster is not filing against it.
    // What must not exist is a second occurrence — a parameter that names WHO to
    // pay, rather than whose rows to show.
    const mentions = [...STAFF.matchAll(/employee_uuid/g)];
    expect(mentions.length, "employee_uuid appears somewhere other than the list filter").toBe(1);
    expect(STAFF).toContain("employee_uuid?: UUID");
  });

  it("the staff page has no create affordance to wire up", () => {
    // Defense in depth on the same property, one layer up: no button, no dialog,
    // no employee picker. Otherwise the 404 above is discovered by a user.
    expect(code(ORG_PAGE)).not.toMatch(/expenseClaimsService\.create/);
    expect(ORG_PAGE).not.toMatch(/function NewClaimDialog/);
    expect(ORG_PAGE).not.toContain("expenses.newClaim");
  });
});

// ---------------------------------------------------------------------------
// 2. The ESS portal can actually upload a receipt
// ---------------------------------------------------------------------------

/**
 * Categories are gone. A claim is free text now — an expense name, an amount, a
 * date and an optional receipt — so nothing on either page may read a category
 * field that the API no longer returns.
 */
describe("the category system is fully removed", () => {
  it("the client has no category service or category claim fields", () => {
    expect(code(SERVICE)).not.toMatch(/expenseCategoriesService|ExpenseCategory\b/);
    expect(code(SERVICE)).not.toMatch(/category_uuid|category_name|category_requires_receipt/);
  });

  it("neither page reads a category or receipt-satisfaction field", () => {
    expect(code(ORG_PAGE)).not.toMatch(/category_name|category_uuid|receipt_satisfied/);
    expect(code(ESS_PAGE)).not.toMatch(/category_name|category_uuid|receipt_satisfied/);
  });

  it("the claim is identified by its free-text expense name", () => {
    expect(code(SERVICE)).toContain("expense_name: string;");
    expect(code(ORG_PAGE)).toContain("r.expense_name");
    expect(code(ESS_PAGE)).toContain("r.expense_name");
  });
});

// ---------------------------------------------------------------------------

describe("the employee portal uploads receipts through its OWN route", () => {
  const ESS = serviceBlock(code(SERVICE), "myExpensesService");

  it("posts to /my/expenses/:uuid/receipts", () => {
    expect(ESS).toContain("/my/expenses/${uuid}/receipts");
  });

  it("does NOT reuse the staff receipt upload", () => {
    // The bug this catches is a real one that was written and then caught: the
    // staff endpoint is org-gated, so an employee would get a 403 from inside the
    // one action the ESS portal exists to enable, and the only symptom would be a
    // receipt that never appears with no error shown.
    expect(ESS).not.toContain("/org/expense-claims/${uuid}/receipts");
  });

  it("downloads and removes through the self-service attachment routes too", () => {
    expect(ESS).toContain("/my/expense-attachments/${attachmentUuid}/download");
    expect(ESS).toContain("/my/expense-attachments/${attachmentUuid}");
  });

  it("the ESS page wires its attachment handlers to the self-service client", () => {
    // Not expenseClaimsService. A card wired to the staff service looks identical
    // and silently 403s.
    expect(ESS_PAGE).toMatch(/download: \(uuid\) => myExpensesService\.downloadAttachment/);
    expect(ESS_PAGE).toMatch(/remove: \(uuid\) => myExpensesService\.removeAttachment/);
    expect(ESS_PAGE).not.toMatch(/remove: \(uuid\) => expenseClaimsService\.removeAttachment/);
  });

  it("the staff page wires ITS handlers to the staff client", () => {
    // The mirror image. Two pages sharing one AttachmentCard is only safe while
    // each passes the endpoints that match its own permissions.
    expect(ORG_PAGE).toMatch(/download: \(uuid\) => expenseClaimsService\.downloadAttachment/);
    expect(ORG_PAGE).toMatch(/remove: \(uuid\) => expenseClaimsService\.removeAttachment/);
  });

  it("uploads go as multipart FormData, never a path field", () => {
    expect(ESS).toContain("new FormData()");
    expect(ESS).toContain("multipart/form-data");
    // A JSON POST of a File object uploads the string "[object File]" and still
    // reports success.
    expect(code(SERVICE)).not.toMatch(/receipt_path|invoice_path|file_path/);
  });
});

// ---------------------------------------------------------------------------
// 3. No action the server would refuse
// ---------------------------------------------------------------------------

describe("the review page only offers transitions the server implements", () => {
  it("Approve is available without a receipt, because receipts are optional", () => {
    // There is no category receipt policy any more, so the server does not refuse
    // an approval for a missing receipt and the UI must not pretend otherwise.
    expect(ORG_PAGE).not.toMatch(/receipt_satisfied/);
    expect(ORG_PAGE).not.toMatch(/expenses\.approveNeedsReceipt/);
  });

  it("Mark paid appears only for an approved DIRECT claim", () => {
    // markClaimPaid refuses a payroll-mode claim outright, because hand-paying one
    // and letting the next payroll run consume it is the double payment this
    // module exists to prevent.
    expect(ORG_PAGE).toMatch(/r\.status === "approved" && r\.payment_mode === "direct"/);
  });

  it("Review and Reject appear only on a pending claim", () => {
    // A claim cannot be decided twice, so the actions on an approved row would be
    // pure 409s.
    expect(ORG_PAGE).toMatch(/r\.status === "pending" \?/);
    const at = ORG_PAGE.indexOf('r.status === "pending" ?');
    const branch = ORG_PAGE.slice(at, at + 900);
    expect(branch).toContain("expenses.approve");
    expect(branch).toContain("expenses.reject");
    // And nothing from the paid branch leaked in, which is the way this gate is
    // most likely to be broken by a later edit.
    expect(branch).not.toContain("expenses.markPaid");
  });

  it("a rejection cannot be submitted without a reason", () => {
    // The server refuses an unexplained rejection, and an employee who is told
    // nothing actionable has to ask HR what was wrong.
    expect(ORG_PAGE).toMatch(
      /register\("rejection_reason", \{\s*required: t\("expenses\.rejectionReasonRequired"\)/,
    );
    // And the reason is only shown when the decision is a rejection, so the
    // approve path is not cluttered by a field it must not send.
    expect(ORG_PAGE).toMatch(/decision === "rejected" \?/);
  });
});

// ---------------------------------------------------------------------------
// 4. Approval is not payment — the distinction the page exists to hold
// ---------------------------------------------------------------------------

describe("the page does not let anyone read Approved as Paid", () => {
  it("Payout is a column separate from Status", () => {
    // An approved payroll-mode claim has NOT been paid: the money goes out with
    // the next payroll run. One status column would tell finance the employee
    // already has it.
    expect(ORG_PAGE).toContain('key: "payout"');
    expect(ORG_PAGE).toContain("expenses.payout");
  });

  it("an approved payroll claim reads as awaiting payroll, not as settled", () => {
    expect(ORG_PAGE).toContain("expenses.awaitingPayroll");
    expect(ORG_PAGE).toMatch(
      /r\.payment_mode === "payroll"\s*\n?\s*\? t\("expenses\.awaitingPayroll"\)/,
    );
  });

  it("a settled claim says how it was settled", () => {
    expect(ORG_PAGE).toContain("expenses.paidViaPayroll");
    expect(ORG_PAGE).toContain("expenses.paidDirect");
  });

  it("the ESS page names the NEXT event rather than repeating the status", () => {
    expect(ESS_PAGE).toContain("expenses.whatNext");
    expect(ESS_PAGE).toContain("expenses.awaitingPayroll");
    expect(ESS_PAGE).toContain("expenses.resubmitHint");
  });

  it("there is no control on either page that edits the amount", () => {
    // An approval screen with an editable amount is how a company reimburses a
    // number nobody claimed. The honest route is reject-with-reason.
    expect(ORG_PAGE).not.toMatch(/adjusted_amount|override_amount/);
    expect(code(ORG_PAGE)).not.toMatch(/expenseClaimsService\.update\(/);
  });
});

// ---------------------------------------------------------------------------
// 5. The client never sends a status
// ---------------------------------------------------------------------------

describe("the expenses client never sends status", () => {
  // The self-service object is the only one with a `create` left: the staff
  // client's was removed with POST /org/expense-claims.
  const STAFF = serviceBlock(code(SERVICE), "expenseClaimsService");
  const ESS = serviceBlock(code(SERVICE), "myExpensesService");

  it("create takes no status", () => {
    const at = ESS.indexOf("create:");
    const body = ESS.slice(at, at + 400);
    expect(body.length, "myExpensesService.create not found").toBeGreaterThan(50);
    expect(body).not.toMatch(/\bstatus\b/);
  });

  it("no inline POST body sends a status", () => {
    // review/pay/bulkPay build theirs as object literals.
    const posts = [...STAFF.matchAll(/\.post(?:<[^>]*>)?\([^,]+,\s*(\{[\s\S]*?\})/g)];
    expect(posts.length, "expected inline POST bodies").toBeGreaterThan(0);
    for (const [, body] of posts) {
      expect(body, `a POST body sends status: ${body.slice(0, 60)}`).not.toMatch(/\bstatus\s*:/);
    }
    // The status must still be DECLARED as a response field — in the RESPONSE
    // type, which is outside the service object, so this asserts on the file
    // rather than on the block.
    expect(SERVICE).toContain("status: ClaimStatus");
    // And the only place `status` may appear in the service object is the list
    // FILTER, forwarded as a query param. `params.status || undefined` is a read;
    // a `status:` field in a body would be a write the server ignores.
    const statusUses = [...STAFF.matchAll(/status\s*:/g)].length;
    expect(statusUses, "status appears somewhere other than the list filter").toBe(1);
    expect(STAFF).toContain("status: params.status || undefined");
  });

  it("review sends a decision, not a status", () => {
    // `status` would type fine and be ignored — the server derives the transition
    // from the claim's current state plus the decision.
    expect(STAFF).toMatch(/decision: "approved"/);
    expect(STAFF).toMatch(/decision: "rejected"/);
    expect(STAFF).not.toMatch(/status:\s*"(approved|rejected)"/);
  });

  it("bulk pay surfaces BOTH lists, because partial success is normal", () => {
    // One claim already settled, one routed through payroll: the batch still
    // settles the rest. A caller that only reads `paid` believes the whole batch
    // is done.
    expect(STAFF).toMatch(/paid: UUID\[\]; refused: \{ uuid: string; reason: string \}\[\]/);
  });
});

// ---------------------------------------------------------------------------
// 6. Filters must not strand the table past its last page
// ---------------------------------------------------------------------------

describe("filter changes cannot strand the table on a page past its end", () => {
  it("there is no status or category filter left to strand the table", () => {
    expect(code(ORG_PAGE)).not.toMatch(/setStatusFilter|setCategoryFilter|category_uuid/);
  });

  it("the date column carries the date and nothing else", () => {
    // The description used to sit under the date in the same cell. It had
    // `truncate` on it, which does nothing here: truncate clips against a BOUNDED
    // parent, and a table cell is sized by its content, so a long description
    // widened the column instead of being cut. The queue became a wall of prose
    // where a scannable date column should be.
    const col = ORG_PAGE.slice(
      ORG_PAGE.indexOf('key: "expense_date"'),
      ORG_PAGE.indexOf('key: "amount"'),
    );
    expect(col.length, "the expense_date column was not found").toBeGreaterThan(50);
    expect(col).toContain("formatDate(r.expense_date)");
    expect(col).not.toMatch(/r\.description/);
    // ...and the row no longer wraps it in a block at all.
    expect(col).not.toMatch(/<div/);
  });

  it("the description is still readable — in the detail sheet, where it is read", () => {
    // Removing it from the TABLE is not removing it from the product. A reviewer
    // decides on the detail, and that is where the prose belongs.
    expect(ORG_PAGE).toMatch(/claim\.description/);
    expect(ORG_PAGE).toContain("expenses.descriptionLabel");
  });
});

// ---------------------------------------------------------------------------
// 7. Dialogs must not silently overwrite the row behind them
// ---------------------------------------------------------------------------

describe("a dialog opened for one claim is not pre-filled from the last", () => {
  it("the review form resets on the closed -> open transition", () => {
    // Without this, opening Review for a second claim keeps the first claim's
    // rejection reason and payment mode — and a rejection saved with the wrong
    // reason is a decision nobody can audit.
    expect(ORG_PAGE).toMatch(/wasOpen\.current/);
    expect(ORG_PAGE).toMatch(/reset\(\{/);
  });

  it("the new-claim form resets too, so an abandoned claim leaves nothing behind", () => {
    expect(ESS_PAGE).toMatch(/wasOpen\.current/);
    expect(ESS_PAGE).toMatch(/reset\(\{/);
  });

  it("staged receipt files are cleared when the sheet changes subject", () => {
    // Otherwise a receipt picked for one claim is silently uploaded against
    // whatever claim is opened next.
    expect(ORG_PAGE).toMatch(/if \(!open\) setFiles\(\[\]\)/);
    expect(ESS_PAGE).toMatch(/if \(!open\) setFiles\(\[\]\)/);
  });

  it("both pages report a failed mutation rather than doing nothing", () => {
    // These run as `void`-ish calls in places; without a catch a rejection is
    // invisible AND an unhandled rejection.
    expect(ORG_PAGE).toContain("apiErrorMessage(");
    expect(ORG_PAGE).toContain("toast.error(");
    expect(ESS_PAGE).toContain("apiErrorMessage(");
    expect(ESS_PAGE).toContain("toast.error(");
  });
});

// ---------------------------------------------------------------------------
// 8. Client-side validation is advisory, and says so
// ---------------------------------------------------------------------------

describe("the client-side date and limit checks mirror the server's", () => {
  it("warns about the backdate window using the shared constant", () => {
    // Duplicated from the backend's MAX_BACKDATE_DAYS on purpose, and therefore
    // able to drift — which is why it only WARNS and never blocks, and why the
    // server's value is the one that counts.
    expect(SERVICE).toMatch(/export const MAX_BACKDATE_DAYS = 90/);
    expect(ESS_PAGE).toContain("MAX_BACKDATE_DAYS");
    expect(ESS_PAGE).toMatch(/tooOld = daysBack > MAX_BACKDATE_DAYS/);
  });

  it("blocks a future date in the picker, which the server also refuses", () => {
    expect(ESS_PAGE).toMatch(/max=\{today\}/);
    expect(ESS_PAGE).toMatch(/inFuture = daysBack < 0/);
  });

  it("does not warn about a category limit the API no longer has", () => {
    // An amount is the employee's figure; there is no policy table to compare it
    // against, so a client-side ceiling would be invented.
    expect(ESS_PAGE).not.toMatch(/overLimit/);
  });
});

// ---------------------------------------------------------------------------
// 9. Navigation and access control
// ---------------------------------------------------------------------------

describe("navigation and access control", () => {
  it("exposes both pages in the sidebar", () => {
    expect(NAV).toContain('to: "/org/expense-claims"');
    expect(NAV).toContain('to: "/my-expenses"');
  });

  it("has a route-access row for both, or the sidebar links go nowhere", () => {
    // The coverage test in routeAccess.test.ts enforces the same thing generically;
    // this names the two paths so a removal here is obvious.
    expect(ACCESS).toContain('"/org/expense-claims"');
    expect(ACCESS).toContain('"/my-expenses"');
  });

  it("opens the review page to staff, mirroring the backend's expenseReviewMgmt", () => {
    expect(ACCESS).toMatch(/"\/org\/expense-claims":\s*\{\s*roles:\s*STAFF_ROLES,/);
  });

  it("gates the review queue on approve_expenses, so a sub-admin must be granted it", () => {
    // UPDATED. Was role-only, which meant every sub-admin could approve expenses and
    // settle reimbursements regardless of feature_access.
    expect(ACCESS).toMatch(
      /"\/org\/expense-claims":\s*\{[^}]*feature:\s*"approve_expenses"/,
    );
    expect(ACCESS).toMatch(
      /"\/org\/expense-claims":\s*\{[^}]*always:\s*\["org_admin"\]/,
    );
  });

  it("opens the employee page to anyone who can be ON THE ROSTER", () => {
    // ON_ROSTER_ROLES, not ALL_ORG_ROLES. A sub-admin on the roster has taxi fares to
    // reclaim like anyone else, so they keep it. An org_admin administers the company
    // and is not on its payroll: `callerEmployee` returns null for them and the handler
    // answers with an EMPTY list rather than a 403, so the page would only ever be an
    // empty table. See ON_ROSTER_ROLES in routeAccess.ts.
    expect(ACCESS).toMatch(/"\/my-expenses":\s*\{\s*roles:\s*ON_ROSTER_ROLES\s*\}/);
    // And the backend is deliberately untouched: it still mounts /my/expenses behind
    // authUser with no role check, so this is a decision about not ASKING, not about
    // what the server would answer.
    expect(ACCESS).toMatch(/"\/my-expenses":\s*\{\s*roles:\s*ON_ROSTER_ROLES\s*\}/);
  });

  it("uses module_flags for plan entitlement, not a per-user feature key", () => {
    // Inventing an "expense" permission here would be a second source of truth
    // the backend never consults, and the client would then gate a page the
    // server still serves.
    const from = ACCESS.indexOf('"/org/expense-claims"');
    const block = ACCESS.slice(Math.max(0, from - 700), from + 200);
    expect(block).not.toMatch(/feature:\s*"expense/);
  });

  it("wraps both pages in the ModuleGate for expense_management", () => {
    expect(ORG_PAGE).toContain('<ModuleGate module="expense_management">');
    expect(ESS_PAGE).toContain('<ModuleGate module="expense_management">');
  });
});

// ---------------------------------------------------------------------------
// 10. The shared card stayed safe to reuse
// ---------------------------------------------------------------------------

describe("AttachmentCard is reusable without losing its own safety", () => {
  it("still defaults to the asset endpoints when no handlers are passed", () => {
    // Every existing caller omits handlers. A default of undefined would break all
    // of them the moment this component gained the prop.
    expect(CARD).toContain("handlers = ASSET_ATTACHMENT_HANDLERS");
    expect(CARD).toContain("download: (uuid) => assetsService.downloadAttachment(uuid)");
  });

  it("routes every network call through the injected handlers", () => {
    // If one call site still reached assetsService directly, an expense card would
    // hit the asset routes while claiming to use the expense ones.
    const body = CARD.slice(CARD.indexOf("export function AttachmentCard"));
    expect(body).not.toMatch(/assetsService\./);
    expect(body).toContain("handlers.download(");
    expect(body).toContain("handlers.remove(");
  });

  it("keeps the confirm-before-delete, and still fires from onConfirm", () => {
    // This is the one behaviour in the card that was not re-implemented per module
    // and must not be: a stray click must never destroy a receipt.
    expect(CARD).toContain("onConfirm={() => handleDelete()}");
    expect(CARD).toMatch(/onClick=\{\(\) => setConfirmOpen\(true\)\}/);
  });
});
