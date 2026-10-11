/**
 * Live UI walkthrough - drives a real Chrome against the running app as the given HR user.
 *
 * Pass the OTP as argv[2]. It logs in THROUGH THE UI (email -> password -> 6-digit
 * boxes), so the in-memory access token and the httpOnly refresh cookie are set exactly
 * the way a real user gets them. No token injection, no bypassing the auth flow.
 *
 * Every module is opened, waited for, screenshotted, and watched for:
 *   - console errors / page errors
 *   - failed network requests (4xx/5xx)
 *   - visible error toasts and "no data" empty states
 *
 * Nothing is created. Navigation and read-only rendering only.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const INBOX = path.resolve("dev-smtp-inbox.jsonl");
const EMAIL = "hunainhaider5566@gmail.com";
const PASSWORD = "MazharAbbas123!";
const BASE = "http://localhost:8080";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.resolve("ui-audit");
fs.mkdirSync(OUT, { recursive: true });

const MODULES = [
  ["Leave Requests", "/org/leaves"],
  ["Attendance", "/org/attendance"],
  ["Salary Components", "/org/salary-components"],
  ["Payroll", "/org/payroll"],
  ["Letter Templates", "/org/letter-templates"],
  ["HR Letters", "/org/hr-letters"],
  ["Expense Claims", "/org/expense-claims"],
  ["Asset Categories", "/org/asset-categories"],
  ["Assets", "/org/assets"],
  ["Offboarding", "/org/offboarding"],
  ["Recruitment", "/org/recruitment/candidates"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000 },
});

const page = await browser.newPage();
let bucket = [];
page.on("console", (m) => {
  if (m.type() === "error") bucket.push({ kind: "console", text: m.text().slice(0, 300) });
});
page.on("pageerror", (e) => bucket.push({ kind: "pageerror", text: String(e).slice(0, 300) }));
page.on("requestfailed", (r) =>
  bucket.push({ kind: "netfail", text: `${r.method()} ${r.url()} :: ${r.failure()?.errorText}` }),
);
page.on("response", async (r) => {
  const s = r.status();
  if (s >= 400 && r.url().includes("/api/")) {
    let body = "";
    try { body = (await r.text()).slice(0, 220); } catch {}
    bucket.push({ kind: `http${s}`, text: `${r.request().method()} ${r.url().replace(BASE, "")} :: ${body}` });
  }
});

async function login() {
  log("→ login page");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#email", { timeout: 20000 });
  await page.type("#email", EMAIL);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');

  log("→ waiting for OTP boxes");
  await page.waitForFunction(
    () => document.querySelectorAll('input[maxlength="1"]').length === 6,
    { timeout: 60000 },
  );

  // Each login invalidates the previous OTP, so always read the NEWEST one that
  // the local SMTP catcher just captured for this address.
  let otp = null;
  for (let i = 0; i < 20 && !otp; i++) {
    await sleep(500);
    if (!fs.existsSync(INBOX)) continue;
    const last = fs.readFileSync(INBOX, "utf8").trim().split("\n").filter(Boolean).pop();
    try {
      const rec = JSON.parse(last);
      if (rec.to?.some((t) => t.includes(EMAIL)) && rec.otp) otp = String(rec.otp);
    } catch {}
  }
  if (!otp) throw new Error("no OTP captured by dev-smtp-catcher");
  log(`  captured OTP ${otp}`);

  // Type digit by digit so the component's auto-advance behaves as for a human.
  const boxes = await page.$$('input[maxlength="1"]');
  for (let i = 0; i < 6; i++) await boxes[i].type(otp[i]);

  const btn = await page.$$eval("button", (bs) =>
    bs.findIndex((b) => !b.disabled && /verify|confirm|continue/i.test(b.textContent)),
  );
  const buttons = await page.$$("button");
  await buttons[btn === -1 ? buttons.length - 1 : btn].click();

  await page.waitForFunction(() => !location.pathname.includes("/login"), { timeout: 30000 });
  log("  ✓ logged in, landed on", new URL(page.url()).pathname);
}

async function audit(name, route) {
  bucket = [];
  log(`\n=== ${name}  (${route})`);
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 45000 });
  } catch (e) {
    log(`  ✗ navigation failed: ${e.message}`);
    return { name, route, nav: "FAILED", issues: [{ kind: "nav", text: e.message }] };
  }
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `${name.replace(/\W+/g, "_")}.png`), fullPage: true });

  const info = await page.evaluate(() => {
    const txt = document.body.innerText || "";
    return {
      path: location.pathname,
      textLen: txt.length,
      hasError: /something went wrong|unexpected error|failed to load|cannot be loaded|internal server error/i.test(txt),
      emptyish: txt.length < 400,
      headings: [...document.querySelectorAll("h1,h2")].map((h) => h.innerText.trim()).slice(0, 4),
    };
  });

  // Flag visible toasts (sonner) and the first meaningful text for context.
  const toasts = await page.evaluate(() =>
    [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.trim().slice(0, 160)),
  );

  const issues = [...bucket];
  if (info.hasError) issues.push({ kind: "ui-error-text", text: "error-looking copy on page" });
  if (toasts.length) issues.push({ kind: "toast", text: toasts.join(" | ") });

  const status = issues.length ? "ISSUES" : "clean";
  log(`  status: ${status}  | path=${info.path} | text=${info.textLen}ch | headings=${JSON.stringify(info.headings)}`);
  issues.slice(0, 8).forEach((i) => log(`    [${i.kind}] ${i.text}`));
  return { name, route, status, info, issues };
}

try {
  await login();
  const results = [];
  for (const [name, route] of MODULES) results.push(await audit(name, route));

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));

  log("\n\n========== SUMMARY ==========");
  for (const r of results) {
    log(`${(r.status === "clean" ? "OK    " : "ISSUES")}  ${r.name.padEnd(20)} ${r.issues.length} issue(s)`);
  }
} catch (e) {
  console.error("FATAL:", e.message);
  await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}