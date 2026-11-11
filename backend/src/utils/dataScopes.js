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
    return {
      sql: `(${employeeAlias}.linked_user_uuid = ? OR ${employeeAlias}.added_by_uuid = ?)`,
      params: [req.user.uuid, req.user.uuid],
    };
  }
  return {
    sql: `(${employeeAlias}.linked_user_uuid = ? OR ${employeeAlias}.added_by_uuid = ? OR ${employeeAlias}.reporting_manager_uuid = (SELECT manager.uuid FROM employees manager WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1) OR ${employeeAlias}.added_by_uuid IN (SELECT team_member.linked_user_uuid FROM employees team_member WHERE team_member.organization_id = ? AND team_member.reporting_manager_uuid = (SELECT manager.uuid FROM employees manager WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1)))`,
    params: [req.user.uuid, req.user.uuid, req.scopeOrgId ?? req.user.organization, req.user.uuid, req.scopeOrgId ?? req.user.organization, req.scopeOrgId ?? req.user.organization, req.user.uuid],
  };
}

/** SQL predicate for records owned by a user (e.g. job openings and candidates). */
export function creatorScopeCondition(req, moduleKey, recordAlias = "r") {
  const scope = getDataScope(req.user, moduleKey);
  if (scope === "entire_organization") return null;
  if (scope === "own_records") {
    return { sql: `${recordAlias}.created_by_uuid = ?`, params: [req.user.uuid] };
  }
  const orgId = req.scopeOrgId ?? req.user.organization;
  return {
    sql: `(${recordAlias}.created_by_uuid = ? OR ${recordAlias}.created_by_uuid IN (SELECT team_member.linked_user_uuid FROM employees team_member WHERE team_member.organization_id = ? AND team_member.reporting_manager_uuid = (SELECT manager.uuid FROM employees manager WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1)))`,
    params: [req.user.uuid, orgId, orgId, req.user.uuid],
  };
}

/** Scope-check a creator-owned recruitment record before UUID-based operations. */
export async function assertCreatedRecordInDataScope(req, moduleKey, tableName, recordUuid) {
  const allowedTables = new Set(["candidates", "job_openings", "assets"]);
  if (!allowedTables.has(tableName)) throw new ApiError(500, "Invalid scoped record type");
  const scope = getDataScope(req.user, moduleKey);
  if (scope === "entire_organization") return;
  const [rows] = await pool.query(
    `SELECT created_by_uuid FROM ${tableName} WHERE uuid = ? AND organization_id = ? LIMIT 1`,
    [recordUuid, req.scopeOrgId ?? req.user.organization],
  );
  if (!rows.length) throw new ApiError(404, "Record not found");
  const creatorUuid = rows[0].created_by_uuid;
  if (scope === "own_records") {
    if (creatorUuid !== req.user.uuid) throw new ApiError(404, "Record not found");
    return;
  }
  const [teamRows] = await pool.query(
    `SELECT team_member.linked_user_uuid FROM employees team_member
      WHERE team_member.organization_id = ?
        AND team_member.reporting_manager_uuid = (
          SELECT manager.uuid FROM employees manager
           WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1
        )`,
    [req.scopeOrgId ?? req.user.organization, req.scopeOrgId ?? req.user.organization, req.user.uuid],
  );
  const allowedCreators = new Set([req.user.uuid, ...teamRows.map((row) => row.linked_user_uuid).filter(Boolean)]);
  if (!allowedCreators.has(creatorUuid)) throw new ApiError(404, "Record not found");
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
