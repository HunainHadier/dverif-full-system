import { afterEach, describe, expect, it } from "vitest";

import { authStore, type AuthUser } from "@/lib/auth";

describe("authStore.refreshSession", () => {
  afterEach(() => authStore.clear());

  it("updates cached user permissions alongside the refreshed token", () => {
    authStore.setSession("old-token", {
      uuid: "sub-admin",
      full_name: "Sub Admin",
      email: "sub-admin@example.com",
      role: "user",
      org_role: "sub_admin",
      feature_access: {
        granular_permissions: { "hr_letters.view": false },
        data_scopes: { hr_letters: "own_records" },
      } as unknown as AuthUser["feature_access"],
    });

    authStore.refreshSession("new-token", {
      feature_access: {
        granular_permissions: { "hr_letters.view": true },
        data_scopes: { hr_letters: "entire_organization" },
      } as unknown as AuthUser["feature_access"],
    });

    expect(authStore.get().token).toBe("new-token");
    expect(authStore.get().user).toMatchObject({
      uuid: "sub-admin",
      org_role: "sub_admin",
      feature_access: {
        granular_permissions: { "hr_letters.view": true },
        data_scopes: { hr_letters: "entire_organization" },
      },
    });
  });
});
