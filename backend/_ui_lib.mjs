/**
 * Real-browser UI driving helpers for the HRMS walkthrough.
 * Everything goes through the actual UI (clicks, typing, Radix popups) so the
 * app is exercised exactly as an HR user would exercise it.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

export const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export const BASE = "http://localhost:8080";
export const EMAIL = "hunainhaider5566@gmail.com";
export const PASSWORD = "MazharAbbas123!";
export const INBOX = path.resolve("dev-smtp-inbox.jsonl");
export const SHOTS = path.resolve("ui-shots");
fs.mkdirSync(SHOTS, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1600, height: 1000 },
  });
}

/** Collects console/page/network noise so every step can be attributed to a failure. */
export function watch(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 240)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 240)}`));
  page.on("requestfailed", (r) =>
    errors.push(`netfail: ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`),
  );
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) {
      let b = "";
      try { b = (await r.text()).slice(0, 240); } catch {}
      errors.push(`http${r.status()}: ${r.request().method()} ${r.url().replace(BASE, "")} :: ${b}`);
    }
  });
  return errors;
}

export async function loginUI(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#email", { timeout: 20000 });
  await page.type("#email", EMAIL);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () => document.querySelectorAll('input[maxlength="1"]').length === 6,
    { timeout: 60000 },
  );

  let otp = null;
  for (let i = 0; i < 20 && !otp; i++) {
    await sleep(400);
    if (!fs.existsSync(INBOX)) continue;
    const last = fs.readFileSync(INBOX, "utf8").trim().split("\n").filter(Boolean).pop();
    try {
      const rec = JSON.parse(last);
      if (rec.to?.some((t) => t.includes(EMAIL)) && rec.otp) otp = String(rec.otp);
    } catch {}
  }
  if (!otp) throw new Error("no OTP captured");

  const boxes = await page.$$('input[maxlength="1"]');
  for (let i = 0; i < 6; i++) await boxes[i].type(otp[i]);
  await clickText(page, "button", /verify/i, { timeout: 10000 });
  await page.waitForFunction(() => !location.pathname.includes("/login"), { timeout: 30000 });
  return otp;
}

/** Clicks the first visible element matching `sel` whose text matches `re`. */
export async function clickText(page, sel, re, { timeout = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const handle = await page.evaluateHandle(
      (sel, src, flags) => {
        const rx = new RegExp(src, flags);
        const els = [...document.querySelectorAll(sel)];
        // getClientRects(), not offsetParent: Radix renders dialogs position:fixed,
        // and a fixed element has no offsetParent even when fully visible.
        return els.find((e) => rx.test(e.textContent || "") && e.getClientRects().length) || null;
      },
      sel,
      re.source,
      re.flags,
    );
    const el = handle.asElement();
    if (el) {
      await el.click();
      return true;
    }
    await sleep(250);
  }
  throw new Error(`clickText: no visible ${sel} matching ${re}`);
}

/**
 * Clears a focused input reliably. A triple-click can drop the caret mid-word,
 * which silently inserts text into the middle of an existing value instead of
 * replacing it, so select-all via keyboard is the only trustworthy reset.
 */
async function clearFocused(page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
}

/** Types into the input identified by its placeholder. */
export async function fillPlaceholder(page, placeholder, value) {
  const sel = `input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`;
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await clearFocused(page);
  await page.type(sel, value);
}

/**
 * Radix Select: find the combobox that belongs to a given <Label>, open it,
 * then choose the option whose text matches.
 */
export async function pickSelect(page, labelText, optionRe) {
  const opened = await page.evaluate((labelText) => {
    const labels = [...document.querySelectorAll("label")];
    const label = labels.find((l) => (l.textContent || "").trim().startsWith(labelText));
    if (!label) return false;
    const box = label.closest("div")?.parentElement || label.parentElement;
    const combo = box?.querySelector('[role="combobox"]');
    if (!combo) return false;
    combo.scrollIntoView({ block: "center" });
    combo.click();
    return true;
  }, labelText);
  if (!opened) throw new Error(`pickSelect: combobox for "${labelText}" not found`);

  await page.waitForSelector('[role="option"]', { timeout: 15000 });
  const chosen = await page.evaluateHandle((src, flags) => {
    const rx = new RegExp(src, flags);
    const opts = [...document.querySelectorAll('[role="option"]')];
    return opts.find((o) => rx.test(o.textContent || "")) || null;
  }, optionRe.source, optionRe.flags);
  const el = chosen.asElement();
  if (!el) {
    const available = await page.$$eval('[role="option"]', (os) => os.map((o) => o.textContent));
    await page.keyboard.press("Escape");
    throw new Error(`pickSelect: "${labelText}" has no option matching ${optionRe}. Available: ${JSON.stringify(available)}`);
  }
  await el.click();
  await sleep(200);
}

/**
 * Types into the input inside the field block whose <Label> text matches.
 * Used where the placeholder is too generic to target safely (e.g. "0.00").
 */
export async function fillByLabel(page, labelText, value) {
  const sel = await page.evaluateHandle((labelText) => {
    const label = [...document.querySelectorAll("label")]
      .find((l) => (l.textContent || "").trim().startsWith(labelText));
    if (!label) return null;
    const box = label.closest("div")?.parentElement || label.parentElement;
    return box?.querySelector("input, textarea") || null;
  }, labelText);
  const el = sel.asElement();
  if (!el) throw new Error(`fillByLabel: no input for "${labelText}"`);
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await el.click();
  await clearFocused(page);
  await el.type(value);
}

/**
 * Sets a native date/time input through React's own value tracker so onChange
 * actually fires. CDP's keyboard typing does NOT populate type=time/date inputs
 * in headless Chrome -- the DOM value stays empty and React state never updates.
 */
export async function setNativeInput(page, sel, value) {
  const ok = await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, sel, value);
  if (!ok) throw new Error(`setNativeInput: ${sel} not found`);
  return ok;
}

/**
 * Clicks the "Manage" link that sits in the header row of a specific field
 * (Designation / Department). Needed because both fields have a button with the
 * exact same text -- a plain text search always hits Designation first.
 */
export async function clickManageFor(page, labelText) {
  const opened = await page.evaluate((labelText) => {
    const label = [...document.querySelectorAll("label")]
      .find((l) => (l.textContent || "").trim() === labelText);
    if (!label) return false;
    const row = label.closest("div.flex.items-center.justify-between") || label.parentElement;
    const btn = row?.querySelector("button");
    if (!btn) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  }, labelText);
  if (!opened) throw new Error(`clickManageFor: no Manage button for "${labelText}"`);
  await sleep(1000);
}

/** Radix date picker: click the trigger next to a label and pick a day cell. */
export async function pickDate(page, labelText, day) {
  const opened = await page.evaluate((labelText) => {
    const labels = [...document.querySelectorAll("label")];
    const label = labels.find((l) => (l.textContent || "").trim().startsWith(labelText));
    if (!label) return false;
    const box = label.closest("div")?.parentElement || label.parentElement;
    const btn = box?.querySelector('button');
    if (!btn) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  }, labelText);
  if (!opened) throw new Error(`pickDate: trigger for "${labelText}" not found`);
  await sleep(700);
  const ok = await page.evaluate((d) => {
    const cells = [...document.querySelectorAll('[data-day], td, button')]
      .filter((c) => !c.disabled && (c.textContent || "").trim() === String(d));
    if (cells.length) { cells[0].click(); return true; }
    return false;
  }, day);
  await page.keyboard.press("Escape");
  return ok;
}

/** Reads any visible toast text (success or error). */
export async function toasts(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.trim()),
  );
}

/** Waits for a toast to appear and returns its text. */
export async function waitToast(page, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await toasts(page);
    if (t.length) return t.join(" | ");
    await sleep(250);
  }
  return null;
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Body text, whitespace-normalised, for asserting on what a page actually shows. */
export async function bodyText(page) {
  return page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));
}

export async function dismiss(page) {
  await page.keyboard.press("Escape");
  await sleep(400);
}