/**
 * Audits every i18n key referenced in the source against en.json.
 *
 * A missing key renders as the RAW KEY STRING in the UI â€” i18next has no way to
 * signal it, so `t("letters.templateFormDescription")` simply prints that text on
 * screen. That is exactly the class of bug that is invisible in typecheck and in
 * unit tests, and it is found by reading the screen.
 *
 * Scans src/routes, src/components, src/hooks and src/lib for t("...") and
 * compares against the flattened locale file. Also reports the reverse for
 * en.json only, though those are usually just strings reused conditionally.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC_DIRS = ["src/routes", "src/components", "src/hooks", "src/lib"];
const LOCALES = "src/i18n/locales";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === ".kilo" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      // Skip tests: they quote keys inside comments as documentation
      // (`// t("key")`), which the regex cannot tell apart from real usage.
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      out.push(full);
    }
  }
  return out;
}

// t("key") and t('key') â€” the second arg is the fallback, which is a string
// literal, not a key.
const T_CALL = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g;
// t("key", { ... }) with options, and the plural-ish t("key", "fallback").
const T_WITH_OPTIONS = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]\s*,\s*\{/g;

const files = SRC_DIRS.filter((d) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
}).flatMap((d) => walk(d));

const used = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(T_CALL)) {
    const key = match[1];
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(file);
  }
  for (const match of text.matchAll(T_WITH_OPTIONS)) {
    const key = match[1];
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(file);
  }
}

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? flatten(v, prefix + k + ".") : [prefix + k],
  );

const en = JSON.parse(readFileSync(path.join(LOCALES, "en.json"), "utf8"));
const ur = JSON.parse(readFileSync(path.join(LOCALES, "ur.json"), "utf8"));
const enKeys = new Set(flatten(en));
const urKeys = new Set(flatten(ur));

const missingEn = [];
for (const [key, where] of used) {
  if (!enKeys.has(key))
    missingEn.push({ key, files: [...where].map((f) => f.replace(/\\/g, "/")) });
}

const missingUr = [...enKeys].filter((k) => !urKeys.has(k)).sort();
const orphanEn = [...enKeys].filter((k) => !used.has(k)).sort();

console.log(`scanned ${files.length} source files, ${used.size} distinct keys referenced`);
console.log(`en.json leaf keys: ${enKeys.size} | ur.json leaf keys: ${urKeys.size}\n`);

if (missingEn.length) {
  console.log(`MISSING FROM en.json (${missingEn.length}) â€” these render as raw key text:`);
  for (const m of missingEn) {
    console.log(`  ${m.key}`);
    for (const f of m.files) console.log(`      ${f}`);
  }
} else {
  console.log("MISSING FROM en.json: none");
}

console.log(`\nMISSING FROM ur.json (${missingUr.length}):`);
console.log(missingUr.length ? missingUr.map((k) => `  ${k}`).join("\n") : "  none");

console.log(`\nDEFINED BUT NEVER REFERENCED (${orphanEn.length}) â€” informational:`);
console.log(orphanEn.length ? orphanEn.map((k) => `  ${k}`).join("\n") : "  none");

// KNOWN FALSE POSITIVES. These ARE used, but through a computed key, which a
// regex cannot see: ApprovalTimeline holds `labelKey: "hr.approval.approved"` in a
// lookup table and calls t(style.labelKey), and renders t(`hr.approval.${status}`).
// The expense pages keep a STATUS_LABEL / MODE_LABEL map for the same reason —
// a template literal would hide a typo'd key from this audit entirely.
//
// The RECRUITMENT label groups are the same case, and this is where it matters most:
// they are the labels a recruiter reads while deciding about a real person, so a
// typo'd one would not be a cosmetic wart but a mistranslated stage or verdict.
// They are enumerated here rather than templated in the components precisely so a
// missing entry shows up in THIS list instead of only on screen.
// `nav.*` is included because navItems.ts holds `labelKey: "nav.recruitment"` in a
// table and renders t(it.labelKey).
const DYNAMIC_KEY_PREFIXES = [
  "hr.approval.",
  "expenses.status.",
  "expenses.mode.",
  "recruitment.stageLabel.",
  "recruitment.employmentTypeLabel.",
  "recruitment.jobStatusLabel.",
  "recruitment.interviewStatusLabel.",
  "recruitment.interviewOutcomeLabel.",
  "recruitment.offerApproval",
  // navItems.ts holds `labelKey: "nav.recruitment"` in a table and renders
  // t(it.labelKey), so this one is referenced the same way. Enumerated rather than
  // listing a bare "nav." prefix: that would silence every FUTURE dead nav key too,
  // and the nav labels are the one group where a typo is visible on every page load.
  "nav.recruitment",
];
const stillOrphan = orphanEn.filter((k) => !DYNAMIC_KEY_PREFIXES.some((p) => k.startsWith(p)));
console.log(
  `\n(${DYNAMIC_KEY_PREFIXES.join(", ")}* are referenced via computed keys and are` +
    ` expected in the list above; ${stillOrphan.length} genuinely unreferenced)`,
);

process.exit(missingEn.length ? 1 : 0);
