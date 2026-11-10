import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: vi.fn(),
  getClaim: vi.fn(),
  reviewClaim: vi.fn(),
}));

vi.mock("../src/config/db.js", () => ({ pool: { query: h.query } }));
vi.mock("../src/services/expenses.service.js", () => ({
  listClaims: vi.fn(),
  getClaim: h.getClaim,
  createClaim: vi.fn(),
  attachReceipts: vi.fn(),
  removeReceipt: vi.fn(),
  resolveReceipt: vi.fn(),
  reviewClaim: h.reviewClaim,
  markClaimPaid: vi.fn(),
  bulkMarkClaimsPaid: vi.fn(),
  approveOwnClaim: vi.fn(),
  ATTACHMENT_ENTITY: { CLAIM: "expense_claim" },
}));
vi.mock("../src/utils/auditLog.js", () => ({
  logAudit: vi.fn(),
  getActorFromReq: vi.fn(() => ({})),
}));

const { reviewExpenseClaim } = await import("../src/controllers/org/expenses.controller.js");

const CLAIM = {
  uuid: "aaaaaaaa-0000-4000-8000-000000000003",
  employee_uuid: "aaaaaaaa-0000-4000-8000-000000000002",
  status: "pending",
};

function request(featureAccess = { approve_expenses: true }) {
  return {
    scopeOrgId: 7,
    params: { uuid: CLAIM.uuid },
    body: { decision: "approved" },
    user: {
      uuid: "aaaaaaaa-0000-4000-8000-000000000001",
      org_role: "sub_admin",
      feature_access: featureAccess,
    },
  };
}

describe("Sub Admin expense approval API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.query.mockResolvedValue([[{ uuid: CLAIM.employee_uuid }]]);
    h.getClaim.mockResolvedValue(CLAIM);
  });

  it("denies own-claim approval even when Approve Employee Expenses is granted", async () => {
    await expect(reviewExpenseClaim(request(), {})).rejects.toMatchObject({ statusCode: 403 });
    expect(h.reviewClaim).not.toHaveBeenCalled();
  });

  it("denies approval when the permission is revoked", async () => {
    await expect(reviewExpenseClaim(request({ create_expenses: true }), {})).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.reviewClaim).not.toHaveBeenCalled();
  });
});
