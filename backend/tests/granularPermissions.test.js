import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DATA_SCOPES,
  GRANULAR_PERMISSION_CATALOG,
  hasPermission,
  normalizedFeatureAccess,
  parseGranularPermissions,
} from "../src/utils/permissions.js";

const ORG_ROUTES = readFileSync("src/routes/org.routes.js", "utf8");

describe("granular permission catalog", () => {
  it("never exposes the hard-delete employee controller through the org API", () => {
    expect(ORG_ROUTES).toContain('router.delete("/employees/:uuid", employeeArchive, asyncHandler(archiveReference));');
    expect(ORG_ROUTES).not.toMatch(/router\.delete\(["']\/employees\/:uuid["'][^\n]*deleteEmployee/);
  });
  it("defines the complete requested module/action catalog without duplicate keys", () => {
    const keys = Object.entries(GRANULAR_PERMISSION_CATALOG).flatMap(([module, actions]) =>
      actions.map((action) => `${module}.${action}`),
    );
    expect(keys.length).toBe(65);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("defaults every granular action to denied", () => {
    const parsed = parseGranularPermissions(null);
    for (const actions of Object.entries(GRANULAR_PERMISSION_CATALOG)) {
      for (const action of actions[1]) expect(parsed[`${actions[0]}.${action}`]).toBe(false);
    }
  });

  it("keeps legacy access working until a granular matrix is explicitly saved", () => {
    const user = { org_role: "sub_admin", feature_access: { manage_employees: true } };
    expect(hasPermission(user, "employees.view")).toBe(true);
    expect(hasPermission(user, "employees.archive")).toBe(true);
    expect(hasPermission(user, "employees.view")).toBe(true);
    expect(hasPermission(user, "assets.view")).toBe(false);
  });

  it("treats a saved granular matrix as authoritative over legacy broad grants", () => {
    const user = {
      org_role: "sub_admin",
      feature_access: {
        manage_employees: true,
        granular_permissions: { "employees.view": true, "employees.archive": false },
      },
    };
    expect(hasPermission(user, "employees.view")).toBe(true);
    expect(hasPermission(user, "employees.archive")).toBe(false);
    expect(hasPermission(user, "employees.create")).toBe(false);
  });

  it("does not let malformed granular values grant access", () => {
    expect(parseGranularPermissions("{broken}")).toEqual(
      Object.fromEntries(
        Object.values(GRANULAR_PERMISSION_CATALOG).flatMap((actions, index) =>
          actions.map((action) => [`${Object.keys(GRANULAR_PERMISSION_CATALOG)[index]}.${action}`, false]),
        ),
      ),
    );
  });

  it("validates data scopes and defaults omitted scopes to own records", () => {
    const saved = normalizedFeatureAccess({
      feature_access: {},
      granular_permissions: { "employees.view": true },
      data_scopes: { employees: "entire_organization", attendance: "invalid" },
    });
    expect(saved.granular_permissions["employees.view"]).toBe(true);
    expect(saved.data_scopes.employees).toBe("entire_organization");
    expect(saved.data_scopes.attendance).toBe("own_records");
    expect(DATA_SCOPES).toEqual(["own_records", "my_team", "entire_organization"]);
  });

  it("grants each explicit action independently without leaking to sibling actions", () => {
    const allKeys = Object.entries(GRANULAR_PERMISSION_CATALOG).flatMap(([module, actions]) =>
      actions.map((action) => `${module}.${action}`),
    );
    for (const key of allKeys) {
      const user = { org_role: "sub_admin", feature_access: { granular_permissions: { [key]: true } } };
      expect(hasPermission(user, key), key).toBe(true);
      for (const other of allKeys) {
        if (other === key) continue;
        expect(hasPermission(user, other), `${key} leaked into ${other}`).toBe(false);
      }
    }
  });

  it("preserves legacy expense view, approval and payment grants before granular setup", () => {
    const legacy = { org_role: "sub_admin", feature_access: { approve_expenses: true } };
    expect(hasPermission(legacy, "expenses.view")).toBe(true);
    expect(hasPermission(legacy, "expenses.approve_employee")).toBe(true);
    expect(hasPermission(legacy, "expenses.process_payment")).toBe(true);
    expect(hasPermission(legacy, "expenses.create_own")).toBe(false);
  });

  it("keeps org_admin unrestricted", () => {
    expect(hasPermission({ org_role: "org_admin" }, "employees.archive")).toBe(true);
  });
});
