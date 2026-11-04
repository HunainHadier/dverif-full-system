import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../src/config/db.js";
import { autoCheckoutOpenAttendance } from "../src/services/attendanceAutoCheckout.scheduler.js";

describe("attendance auto-checkout scheduler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets midnight checkout on prior-day checked-in records only", async () => {
    pool.query.mockResolvedValue([{ affectedRows: 2 }]);

    await expect(autoCheckoutOpenAttendance()).resolves.toBe(2);

    const [query] = pool.query.mock.calls[0];
    expect(query).toContain("SET check_out_at=DATE_ADD(`date`, INTERVAL 1 DAY)");
    expect(query).toContain("status='checked_out'");
    expect(query).toContain("`date` < CURDATE()");
    expect(query).toContain("check_in_at IS NOT NULL");
    expect(query).toContain("check_out_at IS NULL");
    expect(query).toContain("status='checked_in'");
  });
});
