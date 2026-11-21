import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/db.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../src/utils/jwt.js", () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));
vi.mock("../src/utils/refreshToken.js", () => ({
  revokeRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

import { pool } from "../src/config/db.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken as verifyRefreshJwt } from "../src/utils/jwt.js";
import {
  revokeRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
} from "../src/utils/refreshToken.js";
import { refreshAccessToken } from "../src/controllers/auth.refresh.controller.js";

const USER_UUID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

function refreshTokenWithPayload(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function response() {
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockImplementation((body) => {
    res.body = body;
    return body;
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  const now = Math.floor(Date.now() / 1000);
  verifyRefreshJwt.mockReturnValue({
    type: "user",
    role: "user",
    userId: USER_UUID,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  });
  verifyRefreshToken.mockResolvedValue({});
  revokeRefreshToken.mockResolvedValue(undefined);
  storeRefreshToken.mockResolvedValue(undefined);
  signAccessToken.mockReturnValue("new-access-token");
  signRefreshToken.mockReturnValue(refreshTokenWithPayload({
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  }));
  pool.query.mockResolvedValueOnce([[
    {
      uuid: USER_UUID,
      full_name: "Sub Admin",
      email: "sub-admin@example.com",
      status: "active",
      profile_image: null,
      organization: 1,
      org_role: "sub_admin",
      feature_access: {
        granular_permissions: { "hr_letters.view": true },
        data_scopes: { hr_letters: "entire_organization" },
      },
      preferred_language: "en",
    },
  ]]);
});

describe("refreshAccessToken", () => {
  it("returns current delegated permissions with the new user token", async () => {
    const res = response();
    await refreshAccessToken(
      { cookies: { dverif_refresh: "old-refresh-token" } },
      res,
    );

    expect(res.body.data.accessToken).toBe("new-access-token");
    expect(res.body.data.user.feature_access).toEqual({
      granular_permissions: { "hr_letters.view": true },
      data_scopes: { hr_letters: "entire_organization" },
    });
    expect(res.body.data.user.org_role).toBe("sub_admin");
    expect(pool.query.mock.calls[0][0]).toContain("feature_access");
  });
});
