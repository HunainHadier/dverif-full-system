import { describe, expect, it } from "vitest";
import { employeeScopeCondition, getDataScope } from "../src/utils/dataScopes.js";

describe("employee-linked data scopes", () => {
  it("preserves organization-wide visibility for legacy users without saved scopes", () => {
    expect(getDataScope({ org_role: "sub_admin", feature_access: { manage_employees: true } }, "employees"))
      .toBe("entire_organization");
  });

  it("always leaves Org Admin with full organization scope", () => {
    expect(getDataScope({ org_role: "org_admin", feature_access: { data_scopes: { employees: "own_records" } } }, "employees"))
      .toBe("entire_organization");
  });

  it("filters own-record scope by the caller's linked employee record", () => {
    const req = {
      user: { uuid: "user-1", org_role: "sub_admin", feature_access: { data_scopes: { employees: "own_records" } } },
      scopeOrgId: 7,
    };
    expect(employeeScopeCondition(req, "employees", "e")).toEqual({
      sql: "(e.linked_user_uuid = ? OR e.added_by_uuid = ?)",
      params: ["user-1", "user-1"],
    });
  });

  it("filters team scope to the caller and their direct reports", () => {
    const req = {
      user: { uuid: "user-1", org_role: "sub_admin", feature_access: { data_scopes: { attendance: "my_team" } } },
      scopeOrgId: 7,
    };
    expect(employeeScopeCondition(req, "attendance", "e")).toEqual({
      sql: "(e.linked_user_uuid = ? OR e.added_by_uuid = ? OR e.reporting_manager_uuid = (SELECT manager.uuid FROM employees manager WHERE manager.organization_id = ? AND manager.linked_user_uuid = ? LIMIT 1))",
      params: ["user-1", "user-1", 7, "user-1"],
    });
  });

  it("does not apply a SQL filter for entire-organization scope", () => {
    const req = {
      user: { uuid: "user-1", org_role: "sub_admin", feature_access: { data_scopes: { payroll: "entire_organization" } } },
      scopeOrgId: 7,
    };
    expect(employeeScopeCondition(req, "payroll", "e")).toBeNull();
  });
});
