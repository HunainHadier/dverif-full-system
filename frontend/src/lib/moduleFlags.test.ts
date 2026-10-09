import { describe, it, expect } from "vitest";
import { MODULE_FEATURES, MODULE_GROUPS, ALL_MODULE_FLAGS_ON, type ModuleFlags } from "@/services";

/**
 * Guards the client-side mirror of the backend's module registry.
 *
 * The backend (src/utils/moduleFlags.js) is the real enforcement point. This
 * file is the UI's copy of the same list, and the failure mode of drift is
 * silent and confusing: a module present in the plan editor but unknown to the
 * middleware is a toggle that does nothing, and a module the middleware knows
 * but this list omits is one an admin cannot turn on at all.
 */

const ALL_KEYS = MODULE_FEATURES.map((m) => m.key);

describe("module registry", () => {
  it("covers all eighteen modules", () => {
    expect(MODULE_FEATURES).toHaveLength(18);
  });

  it("has no duplicate keys", () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length);
  });

  it("keeps the five original core-HR modules first", () => {
    expect(ALL_KEYS.slice(0, 5)).toEqual([
      "employee_management",
      "attendance_management",
      "user_management",
      "leave_management",
      "payroll_management",
    ]);
  });

  it("gives every module a label, so the plan editor never shows a raw key", () => {
    for (const { key, label } of MODULE_FEATURES) {
      expect(label, key).toBeTruthy();
      expect(label, key).not.toContain("_");
    }
  });
});

describe("MODULE_GROUPS partitions the registry exactly", () => {
  const grouped = MODULE_GROUPS.flatMap((g) => g.moduleKeys);

  it("contains every module", () => {
    expect(ALL_KEYS.filter((k) => !grouped.includes(k))).toEqual([]);
  });

  it("contains nothing that is not a real module", () => {
    expect(grouped.filter((k) => !ALL_KEYS.includes(k))).toEqual([]);
  });

  it("lists no module twice", () => {
    expect(grouped.length).toBe(new Set(grouped).size);
  });

  it("gives every group a unique key and a label", () => {
    const keys = MODULE_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of MODULE_GROUPS) {
      expect(group.label, group.key).toBeTruthy();
      expect(group.moduleKeys.length, group.key).toBeGreaterThan(0);
    }
  });
});

describe("ALL_MODULE_FLAGS_ON", () => {
  it("grants every module", () => {
    const flags = ALL_MODULE_FLAGS_ON as Record<string, boolean>;
    expect(Object.keys(flags).sort()).toEqual([...ALL_KEYS].sort());
    expect(Object.values(flags).every((v) => v === true)).toBe(true);
  });

  it("satisfies the ModuleFlags type for all eighteen keys", () => {
    // A compile-time assertion as well as a runtime one: adding a key to
    // ModuleFlags without adding it to MODULE_FEATURES fails to build here.
    const flags: ModuleFlags = ALL_MODULE_FLAGS_ON;
    expect(flags.manpower_management).toBe(true);
    expect(flags.hr_letters_management).toBe(true);
  });
});
