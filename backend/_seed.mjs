/**
 * Seeds the minimum reference data an HR needs, entirely through the real UI,
 * then creates employees. Nothing is inserted via SQL -- every row here is
 * produced by filling in the app's own forms and clicking its own buttons, so
 * the create path itself gets exercised.
 */
import { launch, watch, loginUI, clickText, clickManageFor, fillPlaceholder, fillByLabel, pickSelect, toasts, waitToast, shot, sleep } from "./_ui_lib.mjs";

const BASE = "http://localhost:8080";

const DEPTS = ["Human Resources", "Finance", "Engineering", "Operations"];
const DESIGNATIONS = ["HR Manager", "Accountant", "Software Engineer", "Operations Lead"];

const EMPLOYEES = [
  { name: "Ali Raza Khan", cnic: "35202-1234567-1", email: "ali.raza@hakamtechsol.com", phone: "0300-1234567", desig: "HR Manager", dept: "Human Resources", loc: "Karachi HQ", salary: "85000" },
  { name: "Fatima Noor", cnic: "35202-2345678-2", email: "fatima.noor@hakamtechsol.com", phone: "0301-2345678", desig: "Accountant", dept: "Finance", loc: "Karachi HQ", salary: "65000" },
  { name: "Usman Tariq", cnic: "35202-3456789-3", email: "usman.tariq@hakamtechsol.com", phone: "0302-3456789", desig: "Software Engineer", dept: "Engineering", loc: "Lahore Office", salary: "95000" },
];

const page_errors = [];
const report = [];
function step(name, ok, detail = "") {
  report.push({ name, ok, detail });
  console.log(`${ok ? "  OK  " : "  FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

const browser = await launch();
const page = await browser.newPage();
page_errors.push(...watch(page));

try {
  const otp = await loginUI(page);
  console.log(`logged in (OTP ${otp})`);

  // ── Open Add Employee once; it hosts the Manage dialogs for depts/designations
  console.log("\n=== Add Employee dialog ===");
  await page.goto(`${BASE}/org/team`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1500);
  await clickText(page, "button", /add employee/i);
  await page.waitForFunction(
    () => [...document.querySelectorAll("h2, [role=dialog]")].some((e) => /add employee/i.test(e.textContent || "")),
    { timeout: 15000 },
  );
  step("Add Employee dialog opens", true);

  // ── Departments
  console.log("\n=== Departments ===");
  await clickManageFor(page, "Department");
  await sleep(1200);
  const dlg = await page.evaluate(() => document.body.innerText);
  step("Manage Departments dialog opens", /manage departments/i.test(dlg));
  for (const d of DEPTS) {
    await fillPlaceholder(page, "New department name", d);
    await clickText(page, "button", /^\s*add\s*$/i);
    await sleep(900);
  }
  await shot(page, "manage_departments");
  const dtext = await page.evaluate(() => document.body.innerText);
  const dOk = DEPTS.every((d) => dtext.includes(d));
  step("all 4 departments created", dOk, dOk ? "" : `missing: ${DEPTS.filter((d) => !dtext.includes(d)).join(", ")}`);
  await page.keyboard.press("Escape");
  await sleep(800);

  // ── Designations
  console.log("\n=== Designations ===");
  await clickManageFor(page, "Designation");
  await sleep(1200);
  step("Manage Designations dialog opens", /manage designations/i.test(await page.evaluate(() => document.body.innerText)));
  for (const d of DESIGNATIONS) {
    await fillPlaceholder(page, "New designation name", d);
    await clickText(page, "button", /^\s*add\s*$/i);
    await sleep(900);
  }
  await shot(page, "manage_designations");
  const gtext = await page.evaluate(() => document.body.innerText);
  const gOk = DESIGNATIONS.every((d) => gtext.includes(d));
  step("all 4 designations created", gOk, gOk ? "" : `missing: ${DESIGNATIONS.filter((d) => !gtext.includes(d)).join(", ")}`);
  await page.keyboard.press("Escape");
  await sleep(800);
  await page.keyboard.press("Escape");
  await sleep(600);

  // ── Employees
  console.log("\n=== Employees ===");
  for (const e of EMPLOYEES) {
    try {
      // Fresh navigation per employee: reusing an open dialog made the form
      // state unreliable, which produced phantom failures unrelated to the app.
      await page.goto(`${BASE}/org/team`, { waitUntil: "networkidle2", timeout: 60000 });
      await sleep(1500);

      const roster0 = await page.evaluate(() => document.body.innerText);
      if (roster0.includes(e.name)) { step(`employee "${e.name}" created`, true, "already present"); continue; }

      await clickText(page, "button", /add employee/i);
      await page.waitForSelector('input[placeholder*="Enter full name"]', { timeout: 20000 });
      await sleep(600);

      await fillPlaceholder(page, "Enter full name", e.name);
      await fillPlaceholder(page, "XXXXX-XXXXXXX-X", e.cnic);
      await fillPlaceholder(page, "email@example.com", e.email);
      await fillPlaceholder(page, "Phone number", e.phone);
      await pickSelect(page, "Designation", new RegExp(`^${e.desig}$`));
      await pickSelect(page, "Department", new RegExp(`^${e.dept}$`));
      await pickSelect(page, "Employment Type", /full.?time/i);
      await fillPlaceholder(page, "Office / site / remote", e.loc);
      await fillByLabel(page, "Starting Basic Salary", e.salary);

      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")]
          .find((x) => /^create$/i.test((x.textContent || "").trim()) && x.getClientRects().length);
        if (!b) return false;
        b.click();
        return true;
      });
      if (!clicked) throw new Error("Create button not found");

      const t = await waitToast(page, 25000);
      step(`employee "${e.name}" created`, !!t && !/fail|error|invalid|required/i.test(t), t || "no toast");
      await shot(page, `employee_${e.name.split(" ")[0]}`);
    } catch (err) {
      step(`employee "${e.name}" created`, false, err.message);
      await shot(page, `employee_error_${e.name.split(" ")[0]}`);
    }
  }

  // ── Verify the roster actually lists them
  console.log("\n=== Roster verification ===");
  await page.goto(`${BASE}/org/team`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2000);
  const roster = await page.evaluate(() => document.body.innerText);
  await shot(page, "roster");
  for (const e of EMPLOYEES) step(`roster shows "${e.name}"`, roster.includes(e.name));
  step("roster shows employee codes", /EMP/i.test(roster), "");
} catch (err) {
  step("seed run", false, err.message);
  await shot(page, "seed_fatal");
} finally {
  console.log("\n=== console/network errors observed ===");
  const uniq = [...new Set(page_errors)];
  uniq.slice(0, 25).forEach((e) => console.log("  " + e));
  if (!uniq.length) console.log("  (none)");

  console.log("\n=== SUMMARY ===");
  report.forEach((r) => console.log(`  ${r.ok ? "OK  " : "FAIL"}  ${r.name}${r.detail ? " :: " + r.detail : ""}`));
  const failed = report.filter((r) => !r.ok).length;
  console.log(`\n  ${report.length - failed}/${report.length} passed`);

  await browser.close();
}