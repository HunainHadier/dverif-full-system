import { describe, expect, it } from "vitest";
import { computeAutomaticLines, filterWorkingDatesThrough } from "../src/services/payroll.service.js";

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
  it("does not count future scheduled workdays as absences", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
    expect(filterWorkingDatesThrough(dates, "2026-11-01")).toEqual(["2026-11-01"]);

    const result = calc({
      workingDays: 22,
      elapsedWorkingDays: 1,
      attendedDays: 1,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      absentDays: 0,
      workedHours: 8,
    });
    expect(result.perDayRate).toBe(1363.64);
    expect(result.lines.some((line) => line.source === "auto_absenteeism")).toBe(false);
    expect(result.payableRatio).toBe(1);
  });

  it("does not deduct future scheduled hours in hours mode", () => {
    const result = calc({
      workingDays: 22,
      elapsedWorkingDays: 1,
      attendedDays: 1,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      absentDays: 0,
      workedHours: 8,
      policy: { ...settings, salary_calculation_method: "hours" },
    });
    expect(result.expectedHours).toBe(176);
    expect(result.lines.some((line) => line.source === "auto_short_hours")).toBe(false);
    expect(result.payableRatio).toBe(1);
  });
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


describe("salary increment effective-date proration", () => {
  it("keeps an October payroll on the old salary when the raise starts 1 November", async () => {
    const { prorateSalaryPeriods } = await import("../src/services/payroll.service.js");
    const result = prorateSalaryPeriods({
      month: 10,
      year: 2026,
      salaryPeriods: [
        { basic_salary: 50000, effective_from: "2026-01-01", effective_to: "2026-10-31" },
        { basic_salary: 60000, effective_from: "2026-11-01", effective_to: null },
      ],
    });
    expect(result).toBe(50000);
  });

  it("prorates a mid-month increment by calendar days", async () => {
    const { prorateSalaryPeriods } = await import("../src/services/payroll.service.js");
    const result = prorateSalaryPeriods({
      month: 11,
      year: 2026,
      salaryPeriods: [
        { basic_salary: 50000, effective_from: "2026-01-01", effective_to: "2026-11-14" },
        { basic_salary: 60000, effective_from: "2026-11-15", effective_to: null },
      ],
    });
    expect(result).toBe(55333.33);
  });
});
