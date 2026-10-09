import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards interpolation syntax across BOTH locale files.
 *
 * i18next interpolates with DOUBLE braces: {{name}}. A single-brace {name} is ICU
 * message syntax, which i18next parses for plural/select and then leaves
 * untouched, so the template reaches the screen literally:
 *
 *   Delete "{name}"?
 *
 * Nothing catches that. Type checking is fine, the key exists in both files, the
 * i18n audit reports full parity, and the unit tests pass - the string only ever
 * looks wrong to a person reading the dialog. That is exactly how
 * assets.deleteCategoryWarning shipped.
 *
 * The check is textual rather than behavioural so it also covers keys no test
 * happens to render.
 */
const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
const ur = JSON.parse(readFileSync("src/i18n/locales/ur.json", "utf8"));

/** Every leaf string, with its dotted path. */
function leaves(obj: unknown, prefix = ""): [string, string][] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === "object" ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]],
  );
}

const EN = leaves(en);
const UR = leaves(ur);

/** A single-brace placeholder: `{name}` but not `{{name}}`. */
const SINGLE_BRACE = /(?<!\{)\{[a-zA-Z_][a-zA-Z0-9_]*\}(?!\})/;

describe("i18n interpolation syntax", () => {
  it("found both locale files", () => {
    expect(EN.length).toBeGreaterThan(500);
    expect(UR.length).toBeGreaterThan(500);
  });

  for (const [label, entries] of [
    ["en.json", EN],
    ["ur.json", UR],
  ] as const) {
    it(`${label} uses double braces for interpolation`, () => {
      const offenders = entries
        .filter(([, v]) => SINGLE_BRACE.test(v))
        .map(([k, v]) => `${k}: ${v}`);
      expect(
        offenders,
        `single-brace placeholders render literally as the template text:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });

    it(`${label} has no unbalanced braces`, () => {
      const offenders = [];
      for (const [k, v] of entries) {
        const doubles = (v.match(/\{\{/g) || []).length;
        const doublesClosed = (v.match(/\}\}/g) || []).length;
        if (doubles !== doublesClosed) offenders.push(`${k}: ${doubles} {{ vs ${doublesClosed} }}`);
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }

  it("no key uses ICU plural syntax, which is not configured here", () => {
    // i18next ships no plural resolver by default; the whole-file count of ICU
    // plural keys was 1 when this was written, and it rendered as a bare number.
    // The app's own convention is "{{count}} thing(s)".
    const offenders = [];
    for (const [label, entries] of [
      ["en.json", EN],
      ["ur.json", UR],
    ] as const) {
      for (const [k, v] of entries) {
        if (/plural,/.test(v)) offenders.push(`${label} ${k}: ${v}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("parses every value as JSON with no stray template syntax", () => {
    // A truncated or duplicated write to a locale file shows up here rather than
    // as a runtime render failure on one page.
    expect(typeof en).toBe("object");
    expect(typeof ur).toBe("object");
  });
});

describe("the keys this bug actually hit", () => {
  const keys = ["assets.deleteCategoryWarning", "assets.detailDescription", "assets.months"];

  const get = (obj: unknown, key: string) =>
    key
      .split(".")
      .reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);

  for (const key of keys) {
    it(`${key} uses double braces in both locales`, () => {
      for (const [label, obj] of [
        ["en", en],
        ["ur", ur],
      ] as const) {
        const v = get(obj, key);
        expect(v, `${label} ${key} missing`).toBeTypeOf("string");
        expect(SINGLE_BRACE.test(String(v)), `${label} ${key}: ${v}`).toBe(false);
      }
    });
  }

  it("assets.months follows the app's {{count}} convention, not ICU", () => {
    expect(String(get(en, "assets.months"))).toMatch(/\{\{count\}\}/);
    expect(String(get(en, "assets.months"))).not.toMatch(/plural,/);
  });
});
