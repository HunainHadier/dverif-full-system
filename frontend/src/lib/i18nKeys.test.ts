import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every i18n key referenced in the source must exist in BOTH locale files.
 *
 * Why this is a test and not a lint rule: a missing key does not throw. i18next
 * returns the key itself, so `t("letters.templateFormDescription")` quietly prints
 * that text on screen. TypeScript passes — the call is correctly typed either way —
 * and no unit test fails. The only way it is caught is by diffing the referenced
 * keys against the files, which is exactly what this does.
 *
 * It found ELEVEN undefined keys at once, ten of them pre-existing and unrelated
 * to the feature that triggered the audit, meaning several pages had been showing
 * raw key strings to users.
 */

const LOCALES = path.resolve(__dirname, "../i18n/locales");
const SRC_DIRS = [
  path.resolve(__dirname, "../routes"),
  path.resolve(__dirname, "../components"),
  path.resolve(__dirname, "../hooks"),
  path.resolve(__dirname, "../lib"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === ".kilo" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      // Skip tests: they quote keys inside comments as documentation
      // (`// t("key")`), which the regex cannot distinguish from real usage and
      // which reports as a missing key.
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  }
  return out;
}

function flatten(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const files = SRC_DIRS.filter((d) => statSync(d, { throwIfNoEntry: false })?.isDirectory()).flatMap(
  (d) => walk(d),
);

// t("key") and t("key", { options }) — a second STRING argument is a fallback
// value, not a key, so only these two shapes are matched.
const KEY_PATTERNS = [
  /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g,
  /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]\s*,\s*\{/g,
];

const referenced = new Set<string>();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of KEY_PATTERNS) {
    for (const match of text.matchAll(pattern)) referenced.add(match[1]);
  }
}

const en = new Set(flatten(JSON.parse(readFileSync(path.join(LOCALES, "en.json"), "utf8"))));
const ur = new Set(flatten(JSON.parse(readFileSync(path.join(LOCALES, "ur.json"), "utf8"))));

describe("i18n key coverage", () => {
  it("finds source files to scan", () => {
    // Guards the guard: if the glob ever stops matching, every assertion below
    // would pass vacuously.
    expect(files.length).toBeGreaterThan(50);
    expect(referenced.size).toBeGreaterThan(300);
  });

  it("defines every referenced key in en.json", () => {
    const missing = [...referenced].filter((k) => !en.has(k)).sort();
    // A missing key renders as its own name on screen, so the message names them.
    expect(missing, `These render as raw key text in the UI: ${missing.join(", ")}`).toEqual([]);
  });

  it("defines every en.json key in ur.json", () => {
    // Falls back to English silently otherwise, producing a half-Urdu screen.
    const missing = [...en].filter((k) => !ur.has(k)).sort();
    expect(missing, `Missing from ur.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no key defined in ur.json that en.json lacks", () => {
    const orphans = [...ur].filter((k) => !en.has(k)).sort();
    expect(orphans, `Only in ur.json: ${orphans.join(", ")}`).toEqual([]);
  });

  it("stores real Urdu, not mojibake, in ur.json", () => {
    // A PowerShell round-trip through ConvertTo-Json corrupts 65KB of Urdu into
    // replacement characters. The locale file still parses and the key still
    // exists, so only an encoding assertion catches it.
    const urJson = JSON.parse(readFileSync(path.join(LOCALES, "ur.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    for (const namespace of ["common", "nav", "letters", "hr"]) {
      const sample = Object.values(urJson[namespace] ?? {})[0];
      if (typeof sample === "string" && sample.length > 3) {
        expect(sample, `${namespace} is not Urdu`).toMatch(/[\u0600-\u06FF]/);
      }
    }
  });
});
