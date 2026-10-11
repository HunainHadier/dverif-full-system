import { describe, it, expect, vi } from "vitest";
import { getApprovalPolicy, setApprovalPolicy } from "../src/services/approvalWorkflow.service.js";
import { pool } from "../src/config/db.js";

describe("Approval Policy Settings (Items 20 & 21)", () => {
  it("defaults to strict dual-control enabled", async () => {
    vi.spyOn(pool, "query").mockResolvedValueOnce([[]]);
    const policy = await getApprovalPolicy(1);
    expect(policy.strict_dual_control).toBe(true);
  });

  it("persists updated strict dual control setting", async () => {
    vi.spyOn(pool, "query")
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ strict_dual_control: 0 }]]);
    const policy = await setApprovalPolicy(1, { strictDualControl: false });
    expect(policy.strict_dual_control).toBe(false);
  });
});
