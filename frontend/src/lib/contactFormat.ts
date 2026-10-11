/**
 * CNIC and phone formatting, validation and normalisation — one source.
 *
 * BEFORE THIS FILE each form carried its own copy of the rules, and they had
 * already drifted: `org.admins` validated a CNIC, `EmployeeManager` checked only
 * that it was non-empty, and `recruitment.candidates` checked nothing at all. So
 * the same 12-digit number was accepted when a sub-admin was created and refused
 * when a candidate was. A rule applied in three places is a rule that has already
 * gone wrong in two of them.
 *
 * The numbers themselves are unchanged — storage stays the 13 digits the database
 * has always held, and every API payload still carries the dashless form. What
 * changed is that the presentation format, the input mask and the validation all
 * read from the same constant, so the dashed value a recruiter types is the value
 * the server stores, and "42101-2345678-9" typed into any of these forms behaves
 * identically.
 *
 * WHAT THESE DO NOT DO: decide whether a CNIC is REAL. NADRA issues those, and a
 * local check for "plausible province digit" only ever rejects valid numbers.
 * Shape is checked; authenticity is not.
 */

/** 13 digits, no dashes — exactly what the database columns store. */
export const CNIC_DIGITS = 13;

/**
 * Accepts the display form too, so a value pasted with dashes validates rather
 * than being rejected for formatting. `normalizeCnic` reduces it before storage.
 */
export const CNIC_REGEX = /^\d{13}$/;

/** The display and input mask: ddddd-ddddddd-d. */
export function formatCNIC(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "").slice(0, CNIC_DIGITS);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/** The stored form: digits only, everything else discarded. */
export function normalizeCNIC(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(0, CNIC_DIGITS);
}

/**
 * Why a CNIC was refused, or null when it is acceptable.
 *
 * Empty is NOT an error here. Several forms treat a CNIC as optional — a
 * candidate's ID is commonly not collected at application time, and the database
 * column was relaxed to nullable for exactly that reason — so `required` is a
 * separate concern the caller decides, and this only ever complains about a value
 * that was supplied and is the wrong shape.
 */
export function cnicError(value: string | null | undefined): string | null {
  const digits = normalizeCNIC(value);
  if (!digits) return null;
  if (digits.length !== CNIC_DIGITS) return `CNIC must be ${CNIC_DIGITS} digits`;
  return null;
}

/**
 * PHONE: permissive on purpose, and NOT tightened beyond what already existed.
 *
 * The rules were inspected rather than invented. `org.admins` allows digits, +,
 * -, parentheses and spaces, 6–30 characters; `identityUniqueness.js` derives a
 * canonical national form for the uniqueness check; and the SQL trigger keeps a
 * normalized column. None of them agree with each other, and none of them is the
 * "true" format — they are three different jobs (display, uniqueness, storage)
 * that were being asked of one field.
 *
 * So the accepted characters stay as the widest form already in use, and the
 * check only refuses what no local number could ever contain. What this adds is
 * that a form which previously checked NOTHING now checks the same thing as the
 * one that checked something — the point being consistency, not a stricter
 * screener.
 */
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;
export const PHONE_ALLOWED = /^[0-9+\-() ]*$/;

/** Digits only, capped so an absurd paste cannot become a stored value. */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d+]/g, "").slice(0, 20);
}

export function phoneError(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!PHONE_ALLOWED.test(trimmed)) return "Phone may contain digits, spaces and + ( ) -";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return `Phone must be ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits`;
  }
  // A + may only lead. "0300+" is not a number in any dialling plan and is a
  // confident paste rather than a typo.
  if (trimmed.includes("+") && !trimmed.startsWith("+")) {
    return "A leading + must come first";
  }
  return null;
}

/** The message shown under an input, or null for nothing to say. */
export const CONTACT_VALIDATION_LABEL = {
  cnicRequired: "CNIC is required",
  phone: "Enter a valid phone number",
} as const;
