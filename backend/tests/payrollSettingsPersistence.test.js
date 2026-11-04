import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../src/config/db.js";
import { getPayrollSettings, updatePayrollSettings } from "../src/controllers/salary.controller.js";

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const savedSettings = {
  salary_calculation_method: "days",
  calculate_overtime: 0,
  shift_start_time: "09:00:00",
  shift_end_time: "17:00:00",
  overtime_multiplier: "1.50",
  deduct_salary_for_late_arrivals: 1,
  late_arrival_threshold: 3,
};

describe("payroll late-arrival policy persistence", () => {
  beforeEach(() => pool.query.mockReset());

  it("fetches the saved monthly toggle and threshold", async () => {
    pool.query.mockResolvedValueOnce([[savedSettings]]);
    const res = response();

    await getPayrollSettings({
      scopeOrgId: 7,
      query: { month: "11", year: "2026" },
    }, res);

    expect(res.body.data.settings).toMatchObject({
      deduct_salary_for_late_arrivals: true,
      late_arrival_threshold: 3,
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("deduct_salary_for_late_arrivals, late_arrival_threshold"),
      [7, 11, 2026],
    );
  });

  it("saves the monthly toggle and threshold and returns the fetched settings", async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[savedSettings]]);
    const res = response();

    await updatePayrollSettings({
      scopeOrgId: 7,
      user: { uuid: "admin-uuid" },
      body: {
        month: 11,
        year: 2026,
        salary_calculation_method: "days",
        calculate_overtime: false,
        shift_start_time: "09:00",
        shift_end_time: "17:00",
        overtime_multiplier: 1.5,
        deduct_salary_for_late_arrivals: true,
        late_arrival_threshold: 3,
      },
    }, res);

    expect(pool.query.mock.calls[0][0]).toContain("deduct_salary_for_late_arrivals, late_arrival_threshold");
    expect(pool.query.mock.calls[0][1]).toEqual([
      7, 11, 2026, "days", 0, "09:00", "17:00", 1.5, 1, 3, "admin-uuid",
    ]);
    expect(res.body.data.settings).toMatchObject({
      deduct_salary_for_late_arrivals: true,
      late_arrival_threshold: 3,
    });
  });
});
