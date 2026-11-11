import { describe, expect, it } from "vitest";
import {
  DATA_SCOPES,
  GRANULAR_PERMISSION_CATALOG,
  hasPermission,
  normalizedFeatureAccess,
  parseGranularPermissions,
} from "../src/utils/permissions.js";

describe("granular permission catalog", () => {
  it("defines the complete requested module/action catalog without duplicate keys", () => {
    const keys = Object.entries(GRANULAR_PERMISSION_CATALOG).flatMap(([module, actions]) =>
      actions.map((action) => `${module}.${action}`),
    );
    expect(keys.length).toBe(69);
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

  it("keeps org_admin unrestricted", () => {
    expect(hasPermission({ org_role: "org_admin" }, "employees.archive")).toBe(true);
  });
});
