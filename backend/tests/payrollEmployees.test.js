import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../src/config/db.js";
import { listPayrollEmployees } from "../src/controllers/salary.controller.js";

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("listPayrollEmployees", () => {
  beforeEach(() => pool.query.mockReset());

  it("returns current basic salary and named active recurring components", async () => {
    const employee = {
      uuid: "employee-uuid",
      full_name: "Test Employee",
      email: "employee@example.com",
      designation: "Analyst",
      department: "Finance",
      basic_salary: "100000.00",
      overtime_amount: "2000.00",
    };
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { employee_uuid: employee.uuid, amount: "500", name: "Transport", type: "allowance", is_percentage: 0 },
        { employee_uuid: employee.uuid, amount: "10", name: "Housing", type: "allowance", is_percentage: 1 },
        { employee_uuid: employee.uuid, amount: "1500", name: "Tax", type: "deduction", is_percentage: 0 },
        { employee_uuid: employee.uuid, amount: "5", name: "Insurance", type: "deduction", is_percentage: 1 },
      ]]);

    const res = mockRes();
    await listPayrollEmployees({ scopeOrgId: 7, query: { page: "1", limit: "1000" } }, res);

    const response = res.json.mock.calls[0][0];
    expect(response.data.items).toEqual([
      {
        ...employee,
        allowance_items: [
          { name: "Transport", amount: 500 },
          { name: "Housing", amount: 10000 },
        ],
        deduction_items: [
          { name: "Tax", amount: 1500 },
          { name: "Insurance", amount: 5000 },
        ],
        allowances: 10500,
        deductions: 6500,
        overtime_amount: 2000,
        net_salary: 106000,
      },
    ]);
    expect(pool.query.mock.calls[2][1]).toEqual([7, employee.uuid]);
  });
});
