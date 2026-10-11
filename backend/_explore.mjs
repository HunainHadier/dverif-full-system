/** Dumps each HR page's real interactive surface so tests can target it precisely. */
import { launch, loginUI, shot, sleep } from "./_ui_lib.mjs";

const BASE = "http://localhost:8080";
const PAGES = [
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
  ["Recruitment openings", "/org/recruitment/openings"],
];

const browser = await launch();
const page = await browser.newPage();
await loginUI(page);

for (const [name, route] of PAGES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1800);

  const info = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length && !/^hidden$/.test(e.getAttribute("aria-hidden") || "");
    const btns = [...document.querySelectorAll("button")].filter(vis)
      .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => t && t.length < 40);
    const tabs = [...document.querySelectorAll('[role="tab"], [data-state="active"]')]
      .map((t) => (t.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
    const sel = [...document.querySelectorAll("select")]
      .map((s) => `${s.name || s.id || "?"}:${[...s.options].map((o) => o.text).slice(0, 5).join("/")}`);
    const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio])')]
      .filter(vis)
      .map((i) => i.placeholder || i.type).slice(0, 8);
    return {
      h1: document.querySelector("h1")?.innerText || "",
      buttons: [...new Set(btns)].slice(0, 12),
      tabs: [...new Set(tabs)].slice(0, 8),
      selects: sel.slice(0, 6),
      inputs: [...new Set(inputs)].slice(0, 6),
      empty: /no .*(yet|found)|nothing|get started|create your first/i.test(document.body.innerText),
    };
  });

  console.log(`\n===== ${name}  (${route}) =====`);
  console.log(`  title   : ${info.h1}`);
  console.log(`  buttons : ${JSON.stringify(info.buttons)}`);
  if (info.tabs.length) console.log(`  tabs    : ${JSON.stringify(info.tabs)}`);
  if (info.selects.length) console.log(`  selects : ${JSON.stringify(info.selects)}`);
  if (info.inputs.length) console.log(`  inputs  : ${JSON.stringify(info.inputs)}`);
  if (info.empty) console.log(`  empty   : yes`);
  await shot(page, `explore_${route.replace(/\W+/g, "_")}`);
}

await browser.close();