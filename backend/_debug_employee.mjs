/** Focused probe: fill Add Employee, click Create, and report exactly why it stalls. */
import { launch, watch, loginUI, clickText, fillPlaceholder, fillByLabel, pickSelect, shot, sleep, toasts } from "./_ui_lib.mjs";

const BASE = "http://localhost:8080";
const browser = await launch();
const page = await browser.newPage();
const errs = watch(page);

page.on("response", async (r) => {
  if (r.url().includes("/org/employees")) {
    let b = "";
    try { b = (await r.text()).slice(0, 400); } catch {}
    console.log(`  [${r.status()}] ${r.request().method()} ${r.url().replace(BASE, "")} :: ${b}`);
  }
});
page.on("request", (r) => {
  if (r.url().includes("/org/employees") && r.method() === "POST") {
    console.log(`  -> POST payload: ${r.postData()?.slice(0, 400)}`);
  }
});

await loginUI(page);
await page.goto(`${BASE}/org/team`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
await clickText(page, "button", /add employee/i);
await sleep(1500);

await fillPlaceholder(page, "Enter full name", "Ali Raza Khan");
await fillPlaceholder(page, "XXXXX-XXXXXXX-X", "35202-1234567-1");
await fillPlaceholder(page, "email@example.com", "ali.raza@hakamtechsol.com");
await fillPlaceholder(page, "Phone number", "0300-1234567");
await pickSelect(page, "Designation", /^HR Manager$/);
await pickSelect(page, "Department", /^Human Resources$/);
await pickSelect(page, "Employment Type", /full.?time/i);
await fillPlaceholder(page, "Office / site / remote", "Karachi HQ");
await fillByLabel(page, "Starting Basic Salary", "85000");
await sleep(600);

console.log("\n=== field values as React sees them ===");
console.log(JSON.stringify(await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[role=dialog] input').forEach((i, n) => {
    out[`in${n}_${(i.placeholder || i.type).slice(0, 18)}`] = i.value;
  });
  return out;
}), null, 2));

console.log("\n=== clicking Create ===");
const found = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^create$/i.test((x.textContent || "").trim()) && x.getClientRects().length);
  if (!b) return "NOT FOUND";
  b.click();
  return "clicked";
});
console.log("  " + found);
await sleep(4000);

console.log("\n=== toasts ===");
console.log("  " + JSON.stringify(await toasts(page)));

console.log("\n=== inline field errors ===");
console.log(JSON.stringify(await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('[role=dialog] *').forEach((el) => {
    const t = (el.textContent || "").trim();
    if (!t || t.length > 90) return;
    const cls = el.className?.baseVal || el.className || "";
    if (typeof cls === "string" && /text-destructive|text-red|role=alert/.test(cls) && el.children.length === 0) {
      bad.push(t);
    }
    if (el.getAttribute("role") === "alert") bad.push(t);
  });
  return [...new Set(bad)];
}), null, 2));

console.log("\n=== dialog still open? ===");
console.log("  " + await page.evaluate(() => !!document.querySelector('[role=dialog]')));

await shot(page, "debug_after_create");
console.log("\n=== network/console errors ===");
[...new Set(errs)].slice(0, 10).forEach((e) => console.log("  " + e));

await browser.close();