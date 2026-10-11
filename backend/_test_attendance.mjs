/** Verifies the new manual-attendance flow end to end through the real UI. */
import { launch, watch, loginUI, clickText, pickSelect, setNativeInput, waitToast, shot, sleep } from "./_ui_lib.mjs";

const BASE = "http://localhost:8080";
const browser = await launch();
const page = await browser.newPage();
const errs = watch(page);
page.on("response", async (r) => {
  if (r.url().includes("manual-entry")) {
    let b = "";
    try { b = (await r.text()).slice(0, 200); } catch {}
    console.log(`  [${r.status()}] POST manual-entry :: ${b}`);
  }
});

await loginUI(page);
await page.goto(`${BASE}/org/attendance`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1800);

console.log("\n1) open Mark attendance dialog");
await clickText(page, "button", /mark attendance/i);
await page.waitForSelector('input[type="time"]', { timeout: 15000 });
console.log("   dialog opened");

console.log("\n2) validation: submit empty");
await clickText(page, "button", /save entry/i);
await sleep(1200);
const errs1 = await page.evaluate(() =>
  [...document.querySelectorAll(".text-destructive")].map((e) => e.textContent.trim()),
);
console.log("   inline errors:", JSON.stringify(errs1));
console.log("   " + (errs1.length >= 3 ? "PASS - guards fired" : "FAIL - no validation shown"));

console.log("\n3) fill a real entry");
await pickSelect(page, "Employee", /Fatima Noor/);
// The date defaults to today; a native date input cannot be retyped reliably,
// so leave it alone. Time inputs need the React-aware setter.
const times = await page.$$('input[type="time"]');
await setNativeInput(page, 'input[type="time"]', "09:15");
const ta = await page.$("textarea");
await ta.type("Field visit - device could not reach the office network");
await shot(page, "attendance_manual_dialog");
await clickText(page, "button", /save entry/i);
const t = await waitToast(page, 25000);
console.log("   toast:", JSON.stringify(t));

await sleep(2500);
const body = await page.evaluate(() => document.body.innerText);
console.log("\n4) row visible in the table?");
console.log("   " + (body.includes("Fatima Noor") ? "PASS - record listed" : "FAIL - not listed"));
console.log("   '09:15' present: " + /09:15|9:15/.test(body));
await shot(page, "attendance_after_save");

console.log("\n=== console/network errors ===");
[...new Set(errs)].slice(0, 10).forEach((e) => console.log("  " + e));
if (!errs.length) console.log("  (none)");

await browser.close();

function localISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}