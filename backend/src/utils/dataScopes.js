import { pool } from "../config/db.js";
import ApiError from "./ApiError.js";

const VALID_SCOPES = new Set(["own_records", "my_team", "entire_organization"]);

function readFeatureAccess(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Legacy users without a saved data_scopes object retain their previous
 * organization-wide visibility. New granular permission saves always include
 * an explicit scope per module.
 */
export function getDataScope(user, moduleKey) {
  if (!user || user.org_role === "org_admin") return "entire_organization";
  const access = readFeatureAccess(user.feature_access);
  const scopes = access.data_scopes;
  if (!scopes || typeof scopes !== "object" || Array.isArray(scopes)) return "entire_organization";
  const value = scopes[moduleKey];
  return VALID_SCOPES.has(value) ? value : "own_records";
}

/**
 * SQL predicate for employee-linked tables joined as the supplied trusted alias.
 * "my_team" means direct reports through employees.reporting_manager_uuid; the
 * current schema does not model nested teams or arbitrary assignment groups.
 */
export function employeeScopeCondition(req, moduleKey, employeeAlias = "e") {
  const scope = getDataScope(req.user, moduleKey);
  if (scope === "entire_organization") return null;
  if (scope === "own_records") {
    return { sql: `${employeeAlias}.linked_user_uuid = ?`, params: [req.user.uuid] };
  }
  return {
    sql: `${employeeAlias}.reporting_manager_uuid = (SELECT manager.uuid FROM employees manager WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1)`,
    params: [req.scopeOrgId ?? req.user.organization, req.user.uuid],
  };
}

/** Prevent direct UUID endpoints from bypassing the list's employee scope. */
export async function assertEmployeeInDataScope(req, moduleKey, employeeUuid) {
  const condition = employeeScopeCondition(req, moduleKey, "e");
  if (!condition) return;
  const orgId = req.scopeOrgId ?? req.user.organization;
  const [rows] = await pool.query(
    `SELECT e.uuid FROM employees e WHERE e.uuid = ? AND e.organization_id = ? AND ${condition.sql} LIMIT 1`,
    [employeeUuid, orgId, ...condition.params],
  );
  if (!rows.length) throw new ApiError(404, "Employee not found");
}
