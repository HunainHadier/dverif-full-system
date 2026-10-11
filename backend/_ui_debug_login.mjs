import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:8080";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();

page.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));
page.on("response", async (r) => {
  if (r.url().includes("/api/")) {
    let b = "";
    try { b = (await r.text()).slice(0, 200); } catch {}
    console.log(`  [${r.status()}] ${r.request().method()} ${r.url().replace(BASE, "")} :: ${b}`);
  }
});

console.log("→ goto /login");
const resp = await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
console.log("  landed:", new URL(page.url()).pathname, "| status:", resp?.status());
console.log("  #email present:", await page.$("#email") !== null);

await page.type("#email", "hunainhaider5566@gmail.com");
await page.type("#password", "MazharAbbas123!");
console.log("→ submitted");
await page.click('button[type="submit"]');
await sleep(6000);

const state = await page.evaluate(() => ({
  path: location.pathname,
  otpBoxes: document.querySelectorAll('input[maxlength="1"]').length,
  inputs: [...document.querySelectorAll("input")].map((i) => `${i.id || i.name || i.type}`),
  bodyText: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 500),
}));
console.log("\n=== POST-LOGIN STATE ===");
console.log(JSON.stringify(state, null, 2));
await page.screenshot({ path: "_ui_debug_login.png", fullPage: true });
console.log("\nscreenshot -> _ui_debug_login.png");
console.log("last OTP in inbox:", fs.existsSync("dev-smtp-inbox.jsonl")
  ? fs.readFileSync("dev-smtp-inbox.jsonl", "utf8").trim().split("\n").pop().slice(0, 120)
  : "none");

await browser.close();