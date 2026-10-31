import { describe, expect, it } from "vitest";
import { computeAutomaticLines } from "../src/services/payroll.service.js";

const settings = {
  salary_calculation_method: "days",
  calculate_overtime: 1,
  hours_per_workday: 8,
  overtime_multiplier: 1.5,
};

function calc(overrides = {}) {
  const summary = {
    workingDays: 20,
    attendedDays: 17,
    paidLeaveDays: 1,
    unpaidLeaveDays: 1,
    absentDays: 1,
    workedHours: 136,
    approvedOvertimeHours: 4,
    actualOvertimeHours: 4,
    policy: settings,
    ...overrides,
  };
  return computeAutomaticLines({ summary, basicSalary: 30000, policy: summary.policy });
}

describe("monthly attendance payroll calculation", () => {
  it("prorates monthly salary by working days and credits paid leave", () => {
    const result = calc();
    expect(result.payableRatio).toBe(0.9);
    expect(result.lines.find((line) => line.source === "auto_unpaid_leave")?.amount).toBe(1500);
    expect(result.lines.find((line) => line.source === "auto_absenteeism")?.amount).toBe(1500);
    expect(result.totalDeduction).toBe(3000);
    expect(result.perDayRate).toBe(1500);
  });

  it("prorates salary by actual working hours when hours mode is selected", () => {
    const result = calc({
      policy: { ...settings, salary_calculation_method: "hours" },
      workedHours: 128,
      paidLeaveDays: 1,
    });
    expect(result.expectedHours).toBe(160);
    expect(result.payableRatio).toBe(0.85);
    expect(result.totalDeduction).toBe(4500);
    expect(result.lines.find((line) => line.source === "auto_short_hours")?.amount).toBe(1500);
  });

  it("pays overtime only when the independent overtime setting is enabled", () => {
    const enabled = calc();
    expect(enabled.lines.find((line) => line.source === "auto_overtime")?.amount).toBe(1125);
    const disabled = calc({ policy: { ...settings, calculate_overtime: 0 } });
    expect(disabled.lines.some((line) => line.source === "auto_overtime")).toBe(false);
  });

  it("does not divide by zero when a month has no scheduled working days", () => {
    const result = calc({ workingDays: 0 });
    expect(result.skipReason).toBe("no_working_days");
    expect(result.divisor).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("returns no automatic deduction for a missing basic salary", () => {
    const result = computeAutomaticLines({
      summary: { ...calc(), workingDays: 20, attendedDays: 0, paidLeaveDays: 0, workedHours: 0, policy: settings },
      basicSalary: null,
      policy: settings,
    });
    expect(result.skipReason).toBe("no_basic_salary");
    expect(result.lines).toEqual([]);
  });
});
