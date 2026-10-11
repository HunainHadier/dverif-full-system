/** Probes why "Save entry" does not fire. */
import { launch, loginUI, clickText, pickSelect, shot, sleep } from "./_ui_lib.mjs";

const BASE = "http://localhost:8080";
const browser = await launch();
const page = await browser.newPage();
page.on("request", (r) => {
  if (r.url().includes("/org/")) console.log(`  REQ ${r.method()} ${r.url().replace(BASE, "")}`);
});
page.on("response", async (r) => {
  if (r.url().includes("/org/attendance")) {
    let b = "";
    try { b = (await r.text()).slice(0, 300); } catch {}
    console.log(`  RES [${r.status()}] ${r.url().replace(BASE, "")} :: ${b}`);
  }
});

await loginUI(page);
await page.goto(`${BASE}/org/attendance`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1800);
await clickText(page, "button", /mark attendance/i);
await page.waitForSelector('input[type="time"]', { timeout: 15000 });

await pickSelect(page, "Employee", /Fatima Noor/);
const times = await page.$$('input[type="time"]');
await times[0].click();
await page.keyboard.type("09:15");
await times[1].click();
await page.keyboard.type("18:40");
const ta = await page.$("textarea");
await ta.click();
await page.keyboard.type("Field visit - device could not reach the office network");
await sleep(800);

console.log("\n=== form state ===");
console.log(JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  const out = {};
  d.querySelectorAll("input,textarea").forEach((i) => {
    out[i.type + (i.placeholder ? ":" + i.placeholder : "")] = i.value;
  });
  d.querySelectorAll('[role="combobox"]').forEach((c) => {
    out["combo:" + (c.textContent || "").slice(0, 24)] = c.textContent;
  });
  out["_inlineErrors"] = [...d.querySelectorAll(".text-destructive")].map((e) => e.textContent.trim());
  const btn = [...d.querySelectorAll("button")].find((b) => /save entry/i.test(b.textContent || ""));
  out["_saveDisabled"] = btn?.disabled ?? "NOT FOUND";
  return out;
}), null, 2));

console.log("\n=== clicking Save ===");
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /save entry/i.test(b.textContent || ""));
  btn?.click();
});
await sleep(6000);

console.log("\n=== after click ===");
console.log(JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  return {
    dialogOpen: !!d,
    inlineErrors: d ? [...d.querySelectorAll(".text-destructive")].map((e) => e.textContent.trim()) : [],
    toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.trim()),
  };
}), null, 2));

await shot(page, "attendance_probe");
console.log("\nscreenshot -> ui-shots/attendance_probe.png");
await browser.close();