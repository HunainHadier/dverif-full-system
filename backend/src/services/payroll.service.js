import ApiError from "../utils/ApiError.js";
import { pool } from "../config/db.js";
import { assertUuid } from "../utils/publicResponse.js";
import { isoDate as normaliseIsoDate } from "../utils/dateRange.js";
import { CURRENCY } from "../utils/currency.js";

/**
 * Payroll's view of what actually happened in a month.
 *
 * Payroll used to be a manual ledger: it read a basic salary and a list of
 * allowance/deduction components and stopped there. Leave and attendance were
 * fully built and never connected to money, so an employee could take unpaid
 * leave, never clock in, and work overtime and still be paid identically to a
 * colleague who did none of it. This module is the join.
 *
 * Monthly payroll uses the organization's explicit per-date working/off-day calendar,
 * actual attendance timestamps, shift timings, and final approved leave treatment.
 */

/**
 * The effective basic salary for a given month.
 *
 * Matched on the month's LAST day against each period's [effective_from,
 * effective_to] range, newest period first.
 *
 * Lives here, not in the salary controller, because two features now need it and
 * must not be able to disagree: monthly payroll, and the Full & Final settlement
 * that pays out unused leave at a per-day rate. A second implementation of "the
 * employee's salary that month" would let FnF quote a different daily rate from
 * the payslip it sits beside, with no error anywhere - just a number nobody can
 * reconcile.
 */
export async function effectiveBasicForMonth({ employeeUuid, orgId, month, year, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const { lastDay } = monthBounds(m, y);
  const [rows] = await conn.query(
    `SELECT basic_salary
       FROM employee_salary_history
      WHERE employee_uuid=?
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC
      LIMIT 1`,
    [employeeUuid, lastDay, lastDay],
  );
  return rows.length ? rows[0].basic_salary : 0;
}

// `currency` is NOT one of these. It was, when administrators could type a
// three-letter code, and its absence here is the point: a currency is no longer
// something an administrator confirms, so a NULL left over from before this
// change must not keep blocking payroll. CURRENCY is applied below instead.
export async function getPayrollSettings(orgId, conn = pool) {
  const [rows] = await conn.query("SELECT * FROM organization_payroll_settings WHERE organization_id=?", [orgId]);
  if (!rows.length) throw new ApiError(409, "Payroll settings are not configured. Select a salary calculation method and configure the organization shift times.");
  const settings = rows[0];
  const start = timeToMinutes(settings.shift_start_time);
  const end = timeToMinutes(settings.shift_end_time);
  const shiftHours = end > start ? (end - start) / 60 : 0;
  if (shiftHours <= 0) throw new ApiError(409, "Organization check-out time must be later than shift start time.");
  return { ...settings, hours_per_workday: shiftHours, currency: CURRENCY };
}

export function assertMonthYear(month, year) {
  const m = parseInt(month, 10);
  if (Number.isNaN(m) || m < 1 || m > 12) throw new ApiError(400, "month must be between 1 and 12");
  const y = parseInt(year, 10);
  if (Number.isNaN(y) || y < 2000 || y > 2100) throw new ApiError(400, "year is invalid");
  return { m, y };
}

/** Inclusive first/last calendar day of a month, as YYYY-MM-DD. */
function monthBounds(month, year) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return {
    firstDay: first.toISOString().slice(0, 10),
    lastDay: last.toISOString().slice(0, 10),
  };
}

/** Round to 2dp. DECIMAL arrives from mysql2 as a string and must not concat. */
function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Working days in a month: the org's configured weekdays, minus holidays.
 *
 * Returned with the set of non-working dates so callers can subtract leave and
 * absence without re-deriving it.
 */
export async function getWorkingDaysForMonth({ orgId, month, year, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const { firstDay, lastDay } = monthBounds(m, y);
  const [rows] = await conn.query(
    "SELECT schedule_date, day_type FROM organization_monthly_work_schedules WHERE organization_id=? AND schedule_date BETWEEN ? AND ?",
    [orgId, firstDay, lastDay],
  );
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (rows.length !== daysInMonth) throw new ApiError(409, "Monthly working schedule is incomplete. Configure every date as a working day or off day before payroll generation.");
  const days = rows.filter((r) => r.day_type === "working").map((r) => isoDate(r.schedule_date));
  const nonWorkingDates = new Set(rows.filter((r) => r.day_type === "off").map((r) => isoDate(r.schedule_date)));
  return { workingDays: days.length, workingDates: days, nonWorkingDates, week: null, holidays: new Set() };
}

/**
 * Normalise a DATE column to YYYY-MM-DD.
 *
 * Delegates to the shared helper in utils/leaveBalance.js, which is where this
 * logic belongs and where it was WRONG until Phase 4: it read the UTC calendar
 * fields of a value mysql2 had built at LOCAL midnight, so on this server (UTC+5)
 * a stored 2026-10-01 came back as 2026-09-30. Holidays stopped matching, leave
 * attached to the wrong days, and a 2-day leave request was charged 3.
 *
 * This function previously carried its own corrected copy, which is how the same
 * bug existed in two places - one fixed, one live. One definition now, imported,
 * because a payroll figure and a leave day count that disagree by a day are both
 * wrong and neither reports an error.
 *
 * DATETIME columns are unaffected: they carry a real time of day and nothing here
 * normalises them.
 */
const isoDate = (value) => normaliseIsoDate(value);

/**
 * Approved leave in the month, split by whether it is paid.
 *
 * The span is CLIPPED to the month, because a request from 28 Feb to 4 Mar must
 * not charge all seven days to February. This is the same LEAST/GREATEST clip the
 * dashboard analytics query uses, applied in JS so the two agree.
 *
 * Only working days inside the span count. Counting the Saturday inside an
 * approved absence as leave AND then also counting it as absent would double-count
 * it, and a payroll deduction is not something to apply twice for the same day.
 */
export async function getApprovedLeaveForMonth({ employeeUuid, month, year, workingDates, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const { firstDay, lastDay } = monthBounds(m, y);
  assertUuid(employeeUuid, "Employee UUID");

  const [rows] = await conn.query(
    `SELECT lr.start_date, lr.end_date, lt.name AS leave_type,
            COALESCE(lr.approved_treatment, lr.requested_treatment, 'unpaid') AS treatment
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_uuid=?
        AND lr.status='approved'
        AND lr.start_date <= ?
        AND lr.end_date >= ?`,
    [employeeUuid, lastDay, firstDay],
  );

  const working = new Set(workingDates);
  const paidDays = new Set();
  const unpaidDays = new Set();

  for (const r of rows) {
    const target = String(r.treatment) === "unpaid" ? unpaidDays : paidDays;
    // Clamp the request to the month, then step through it inclusively.
    let d = isoDate(r.start_date) < firstDay ? firstDay : isoDate(r.start_date);
    const end = isoDate(r.end_date) > lastDay ? lastDay : isoDate(r.end_date);
    const cursor = new Date(`${d}T00:00:00Z`);
    const stop = `${end}T00:00:00Z`;
    while (cursor.toISOString().slice(0, 10) <= stop) {
      const iso = cursor.toISOString().slice(0, 10);
      if (working.has(iso)) target.add(iso);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // A day cannot be both paid and unpaid leave. Paid wins, because the more
  // expensive reading (a deduction) must never come from two overlapping rows.
  for (const d of paidDays) unpaidDays.delete(d);

  return {
    paidLeaveDays: paidDays.size,
    unpaidLeaveDays: unpaidDays.size,
    paidDates: [...paidDays].sort(),
    unpaidDates: [...unpaidDays].sort(),
    requests: rows,
  };
}

/**
 * Attendance in the month: days worked, late arrivals, absences.
 *
 * Absence is implicit in this schema — attendance_records has one row per
 * employee per day and its status is only checked_in/checked_out, so a day with
 * no row is simply a day with no record. So absence is DERIVED, and it must be
 * derived against working days minus leave, or every weekend in the month reads
 * as unpaid absence. An employee on approved leave has no attendance row either,
 * which is the other half of the same double-count.
 */
export async function getAttendanceForMonth({ employeeUuid, month, year, workingDates, excludedDates, lateCutoffMinutes = null, overtimeCutoffMinutes = null, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const { firstDay, lastDay } = monthBounds(m, y);
  assertUuid(employeeUuid, "Employee UUID");

  const [rows] = await conn.query(
    `SELECT date, check_in_at, check_out_at, is_manual
       FROM attendance_records
      WHERE employee_uuid=? AND date BETWEEN ? AND ?`,
    [employeeUuid, firstDay, lastDay],
  );

  const working = new Set(workingDates);
  const excused = new Set(excludedDates ?? []);

  const presentDates = new Set();
  let lateCount = 0;
  let workedHours = 0;
  let actualOvertimeHours = 0;
  const actualOvertimeByDate = {};

  for (const r of rows) {
    const iso = isoDate(r.date);
    if (!working.has(iso)) continue;
    // A workday is complete only when both clock-in and clock-out exist.
    // If a completed attendance record overlaps approved leave, the attendance
    // record wins: the day is treated as worked, not as leave or absence.
    // A check-in-only row must not be treated as a full paid day in days mode.
    if (!r.check_in_at || !r.check_out_at) continue;
    const start = new Date(r.check_in_at).getTime();
    const end = new Date(r.check_out_at).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    presentDates.add(iso);
    workedHours += (end - start) / 3600000;
    if (overtimeCutoffMinutes !== null) {
      const checkout = minutesPastMidnight(r.check_out_at);
      if (checkout !== null && checkout > Number(overtimeCutoffMinutes)) {
        const extra = (checkout - Number(overtimeCutoffMinutes)) / 60;
        actualOvertimeHours += extra;
        actualOvertimeByDate[iso] = extra;
      }
    }
    if (lateCutoffMinutes !== null && minutesPastMidnight(r.check_in_at) > Number(lateCutoffMinutes)) lateCount += 1;
  }

  // Absence = working days, less days with a record, less days excused by leave.
  // Never negative: a manually entered attendance row can otherwise push this
  // below zero and then a negative day count becomes a negative deduction, which
  // reads as a pay rise.
  const excusedCount = [...excused].filter((d) => working.has(d) && !presentDates.has(d)).length;
  const absentDays = Math.max(0, working.size - presentDates.size - excusedCount);

  return {
    attendedDays: presentDates.size,
    workedHours: Math.round(workedHours * 100) / 100,
    actualOvertimeHours: Math.round(actualOvertimeHours * 100) / 100,
    actualOvertimeByDate,
    absentDays,
    lateCount,
    presentDates: [...presentDates].sort(),
  };
}

function minutesPastMidnight(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // check_in_at is stored local wall-clock and read back in server-local time,
  // so local accessors are the ones that match what the employee saw on the
  // clock. Using UTC here would shift every check-in by the server's offset and
  // make the 09:30 cutoff fire at the wrong hour.
  return d.getHours() * 60 + d.getMinutes();
}

/** Approved overtime hours in the month.
 *
 * Only `approved_hours` is ever paid, never `requested_hours`. The two columns
 * exist precisely so the amount a manager allowed can differ from the amount
 * claimed; reading the requested figure is how unapproved hours get paid.
 */
export async function getApprovedOvertimeForMonth({ employeeUuid, month, year, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const { firstDay, lastDay } = monthBounds(m, y);
  assertUuid(employeeUuid, "Employee UUID");

  const [rows] = await conn.query(
    `SELECT work_date, requested_hours, approved_hours
       FROM overtime_requests
      WHERE employee_uuid=?
        AND status='approved'
        AND work_date BETWEEN ? AND ?`,
    [employeeUuid, firstDay, lastDay],
  );

  let approved = 0;
  let requested = 0;
  for (const r of rows) {
    approved += Number(r.approved_hours);
    requested += Number(r.requested_hours);
  }

  return {
    approvedOvertimeHours: money(approved),
    requestedOvertimeHours: money(requested),
    requests: rows.length,
  };
}

/**
 * Everything payroll needs to know about one employee's month.
 *
 * The single entry point the caller should use: it derives the working-day set
 * once and threads it through, because the three sub-queries all depend on the
 * same definition of "a working day" and computing it three times is how they end
 * up disagreeing.
 */
export async function getMonthlyAttendanceAndLeaveSummary({ employeeUuid, orgId, month, year, policy = null, conn = pool }) {
  const { m, y } = assertMonthYear(month, year);
  const activePolicy = policy ?? await getPayrollSettings(orgId, conn);
  const calendar = await getWorkingDaysForMonth({ orgId, month: m, year: y, conn });

  const leave = await getApprovedLeaveForMonth({
    employeeUuid,
    month: m,
    year: y,
    workingDates: calendar.workingDates,
    conn,
  });

  const attendance = await getAttendanceForMonth({
    employeeUuid,
    month: m,
    year: y,
    workingDates: calendar.workingDates,
    // BOTH kinds of leave excuse the day. Paid leave is not a deduction, but the
    // employee still did not clock in, so without this a paid sick-leave day is
    // counted as an absence and docked. That is the bug this argument prevents.
    excludedDates: [...leave.paidDates, ...leave.unpaidDates],
    lateCutoffMinutes: timeToMinutes(activePolicy.shift_start_time),
    overtimeCutoffMinutes: timeToMinutes(activePolicy.shift_end_time),
    conn,
  });

  const overtime = await getApprovedOvertimeForMonth({ employeeUuid, month: m, year: y, conn });

  return {
    month: m,
    year: y,
    workingDays: calendar.workingDays,
    calendarDays: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    policy: activePolicy,
    holidayCount: calendar.holidays.size,
    week: calendar.week,
    attendedDays: attendance.attendedDays,
    workedHours: attendance.workedHours,
    absentDays: attendance.absentDays,
    lateCount: attendance.lateCount,
    paidLeaveDays: leave.paidDates.filter((date) => !attendance.presentDates.includes(date)).length,
    unpaidLeaveDays: leave.unpaidDates.filter((date) => !attendance.presentDates.includes(date)).length,
    approvedOvertimeHours: money(overtime.requests.reduce((sum, request) => {
      const date = isoDate(request.work_date);
      return sum + Math.min(Number(request.approved_hours) || 0, Number(attendance.actualOvertimeByDate[date]) || 0);
    }, 0)),
    actualOvertimeHours: attendance.actualOvertimeHours,
    requestedOvertimeHours: overtime.requestedOvertimeHours,
    overtimeRequests: overtime.requests.length,
  };
}

/**
 * Turn a monthly summary into the automatic line items payroll adds.
 *
 * Line keys are snake_case (`basis_value`, `basis_unit`) so one shape serves the
 * database insert, the API response and the TypeScript type. They started as
 * camelCase and the response then disagreed with the declared type: the client
 * read `basis_value`, got undefined, and the payslip rendered "22 days" in the
 * label with an empty basis next to it.
 *
 * A zero working-day count is not an error the caller should have to handle: an
 * employee who joined and left mid-month, or an org that worked zero days, would
 * otherwise divide by zero and produce Infinity, which becomes NaN in the SQL
 * parameter and a corrupt salary row. There is simply nothing to prorate against,
 * so no automatic line is produced and `workingDays: 0` is returned so the
 * payslip can say why it is empty rather than silently showing nothing.
 */
export function computeAutomaticLines({ summary, basicSalary, policy = summary?.policy }) {
  if (!policy) throw new ApiError(409, "Payroll settings are not configured.");
  const basic = Number(basicSalary) || 0;
  const workingDays = Number(summary.workingDays) || 0;
  const shiftHours = Number(policy.hours_per_workday) || 0;
  const expectedHours = workingDays * shiftHours;
  const paidLeaveDays = Number(summary.paidLeaveDays) || 0;
  const unpaidLeaveDays = Number(summary.unpaidLeaveDays) || 0;
  const attendedDays = Number(summary.attendedDays) || 0;
  const absentDays = Number(summary.absentDays) || 0;
  const method = policy.salary_calculation_method || "days";
  if (!["hours", "days"].includes(method)) throw new ApiError(409, "Select either working-hours or working-days salary calculation.");
  const lines = [];
  if (workingDays <= 0 || basic <= 0) return {
    lines, perDayRate: 0, hourlyRate: 0, perDayHours: shiftHours,
    totalDeduction: 0, totalAddition: 0, workingDays, divisor: 0,
    payableRatio: 0, skipReason: workingDays <= 0 ? "no_working_days" : "no_basic_salary",
    method, expectedHours, workedHours: Number(summary.workedHours || 0),
  };

  const perDayRate = money(basic / workingDays);
  const hourlyRate = expectedHours > 0 ? money(basic / expectedHours) : 0;
  let payableRatio = 1;

  if (method === "days") {
    const payableDays = Math.min(workingDays, attendedDays + paidLeaveDays);
    payableRatio = payableDays / workingDays;
    if (unpaidLeaveDays > 0) lines.push({
      label: `Unpaid leave (${unpaidLeaveDays} day(s) x ${perDayRate})`,
      type: "deduction", source: "auto_unpaid_leave",
      amount: money(perDayRate * unpaidLeaveDays), basis_value: unpaidLeaveDays, basis_unit: "days",
    });
    if (absentDays > 0) lines.push({
      label: `Absence (${absentDays} day(s) x ${perDayRate})`,
      type: "deduction", source: "auto_absenteeism",
      amount: money(perDayRate * absentDays), basis_value: absentDays, basis_unit: "days",
    });
  } else {
    const workedHours = Number(summary.workedHours || 0);
    const creditedHours = workedHours + paidLeaveDays * shiftHours;
    payableRatio = Math.min(1, creditedHours / expectedHours);
    const unpaidAmount = money(hourlyRate * shiftHours * unpaidLeaveDays);
    const absenceAmount = money(hourlyRate * shiftHours * absentDays);
    if (unpaidAmount > 0) lines.push({
      label: `Unpaid leave (${unpaidLeaveDays} day(s), ${unpaidLeaveDays * shiftHours} hours)`,
      type: "deduction", source: "auto_unpaid_leave",
      amount: unpaidAmount, basis_value: unpaidLeaveDays * shiftHours, basis_unit: "hours",
    });
    if (absenceAmount > 0) lines.push({
      label: `Absence (${absentDays} day(s), ${absentDays * shiftHours} hours)`,
      type: "deduction", source: "auto_absenteeism",
      amount: absenceAmount, basis_value: absentDays * shiftHours, basis_unit: "hours",
    });
    const shortHours = Math.max(0, expectedHours - creditedHours - unpaidLeaveDays * shiftHours - absentDays * shiftHours);
    if (shortHours > 0) lines.push({
      label: `Short working hours (${money(shortHours)} hours)`,
      type: "deduction", source: "auto_short_hours",
      amount: money(hourlyRate * shortHours), basis_value: money(shortHours), basis_unit: "hours",
    });
  }

  const overtimeHours = Number(policy.calculate_overtime) === 1 ? Number(summary.approvedOvertimeHours || 0) : 0;
  const multiplier = Number(policy.overtime_multiplier || 1.5);
  if (overtimeHours > 0 && hourlyRate > 0) lines.push({
    label: `Approved overtime (${overtimeHours} hr x ${multiplier} x ${hourlyRate}/hr)`,
    type: "earning", source: "auto_overtime", amount: money(hourlyRate * multiplier * overtimeHours),
    basis_value: overtimeHours, basis_unit: "hours",
  });
  const totalDeduction = money(lines.filter((l) => l.type === "deduction").reduce((sum, line) => sum + line.amount, 0));
  const totalAddition = money(lines.filter((l) => l.type === "earning").reduce((sum, line) => sum + line.amount, 0));
  return {
    lines, perDayRate, hourlyRate, perDayHours: shiftHours, totalDeduction, totalAddition,
    workingDays, divisor: method === "hours" ? expectedHours : workingDays,
    payableRatio, skipReason: null, method, expectedHours,
    workedHours: Number(summary.workedHours || 0),
  };
}

/** Persist the automatic lines against a just-inserted salary record. */
export async function insertSalaryRecordLines({ conn, recordUuid, orgId, employeeUuid, month, year, lines }) {
  for (const line of lines) {
    await conn.query(
      `INSERT INTO salary_record_lines
         (uuid, salary_record_uuid, organization_id, employee_uuid, month, year,
          label, type, source, amount, basis_value, basis_unit, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        recordUuid,
        orgId,
        employeeUuid,
        month,
        year,
        line.label,
        line.type,
        line.source,
        line.amount,
        line.basis_value ?? null,
        line.basis_unit ?? null,
      ],
    );
  }
}

function timeToMinutes(value) {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) throw new ApiError(409, "Organization settings have no valid shift start time. An organization administrator must configure it before payroll preview or generation.");
  return Number(match[1]) * 60 + Number(match[2]);
}
