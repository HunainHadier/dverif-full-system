import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the agreement between the URL the backend prints into a letter's QR
 * code and the page the SPA actually serves.
 *
 * A letter QR is permanent once printed, so if the two disagree the link is
 * dead for every letter ever issued and no code change can recover it. This
 * failed once already: the backend emitted /verify/letter/<token> while the SPA
 * only had /verify/$qrToken, and a valid letter QR returned 404.
 */
const ROOT = process.cwd();

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("public letter verification URL", () => {
  it("the backend builds /verify/letter/<token>", () => {
    const qr = read("../backend/src/utils/letterQr.js");
    const build = qr.match(/buildLetterVerifyUrl[\s\S]*?return\s+`([^`]+)`/);
    expect(build, "buildLetterVerifyUrl not found").toBeTruthy();
    expect(build![1]).toContain("/verify/letter/${qrToken}");
  });

  it("the SPA serves /verify/letter/$qrToken", () => {
    expect(existsSync(join(ROOT, "src/routes/verify.letter.$qrToken.tsx"))).toBe(true);
    const page = read("src/routes/verify.letter.$qrToken.tsx");
    expect(page).toContain('createFileRoute("/verify/letter/$qrToken")');
  });

  it("the route is registered in the generated tree", () => {
    const tree = read("src/routeTree.gen.ts");
    expect(tree).toContain("id: '/verify/letter/$qrToken'");
    expect(tree).toContain("path: '/verify/letter/$qrToken'");
  });

  it("the frontend calls the backend's public letter endpoint", () => {
    const svc = read("src/services/verification.ts");
    expect(svc).toContain("/verify/letter/${encodeURIComponent(qrToken)}");
  });

  it("the backend exposes that endpoint", () => {
    const routes = read("../backend/src/routes/verify.routes.js");
    // Registered BEFORE the single-segment /:qr_token, or "letter" is read as a
    // token and the request 404s for the wrong reason.
    const letterAt = routes.indexOf('router.get("/letter/:qr_token"');
    const bareAt = routes.indexOf('router.get("/:qr_token"');
    expect(letterAt).toBeGreaterThan(-1);
    expect(bareAt).toBeGreaterThan(-1);
    expect(letterAt, "the /letter/ route must be declared before /:qr_token").toBeLessThan(bareAt);
  });

  it("the page offers no revoked state to leak which failure occurred", () => {
    // A revoked letter must be indistinguishable from a forged or unknown one.
    const page = read("src/routes/verify.letter.$qrToken.tsx");
    expect(page).not.toMatch(/\brevoked\b\s*[:=]/i);
    expect(page).toContain("Letter not verified");
  });
});
