import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/db.js", () => ({ pool: { query: vi.fn(), getConnection: vi.fn() } }));

import { pool } from "../src/config/db.js";
import { getMonthlyWorkSchedule } from "../src/controllers/salary.controller.js";

/**
 * The monthly schedule editor is the only place an org can say "this Saturday
 * is a working day". It round-trips through MySQL's DATE type, which mysql2
 * hands back as a JS Date at LOCAL midnight. Serialising that Date to JSON
 * converts it to UTC, and east of Greenwich that lands on the previous day, so
 * a Saturday saved as working reappeared as an off Friday (and re-saving wrote
 * the shift back). The endpoint must therefore return a plain calendar date.
 */
describe("monthly work schedule dates", () => {
  beforeEach(() => pool.query.mockReset());

  it("returns dates as YYYY-MM-DD strings, not timezone-shifted instants", async () => {
    pool.query.mockResolvedValueOnce([
      [
        { schedule_date: new Date(2026, 10, 1), day_type: "off" },
        { schedule_date: new Date(2026, 10, 28), day_type: "working" },
      ],
    ]);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await getMonthlyWorkSchedule({ scopeOrgId: "org-1", query: { month: "11", year: "2026" } }, res);

    expect(res.json.mock.calls[0][0].data.days).toEqual([
      { schedule_date: "2026-11-01", day_type: "off" },
      { schedule_date: "2026-11-28", day_type: "working" },
    ]);
  });
});
