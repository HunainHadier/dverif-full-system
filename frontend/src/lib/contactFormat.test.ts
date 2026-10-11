import { describe, it, expect } from "vitest";

import { cnicError, formatCNIC, normalizeCNIC, normalizePhone, phoneError } from "@/lib/contactFormat";

/**
 * THE RULE, ONCE.
 *
 * Before this module the same CNIC rule existed in one form, a different CNIC
 * rule existed in a second, and the candidate form had no rule at all. These
 * tests pin the one rule all three now share, and — more importantly — pin the
 * behaviour that makes it usable: the dashed shape people type is accepted, the
 * digits-only shape people store is what comes out, and an ABSENT value is not
 * an error, because a candidate's CNIC is routinely not in hand yet.
 */

describe("CNIC format", () => {
  it("formats 13 digits into ddddd-ddddddd-d", () => {
    expect(formatCNIC("4210123456789")).toBe("42101-2345678-9");
  });

  it("masks a partial input rather than refusing it mid-typing", () => {
    // A mask that rejects mid-entry is unusable: the recruiter types five digits
    // and the field throws before the eighth arrives.
    expect(formatCNIC("4210")).toBe("4210");
    expect(formatCNIC("42101")).toBe("42101");
    expect(formatCNIC("421012")).toBe("42101-2");
    expect(formatCNIC("42101234")).toBe("42101-234");
    // 12 of 13 digits still shows the 5-7 split, so the final dash appears only
    // when the 13th digit arrives. A mask that shows all three parts early
    // implies a value is complete when it is not.
    expect(formatCNIC("421012345678")).toBe("42101-2345678");
  });

  it("normalises the dashed display form back to bare digits", () => {
    expect(normalizeCNIC("42101-2345678-9")).toBe("4210123456789");
    expect(normalizeCNIC("42101 2345678 9")).toBe("4210123456789");
  });

  it("accepts a dashed value and reports no error", () => {
    // The dashes are how the card is printed, so this is how it is typed. The
    // mask must not reject its own display form.
    expect(cnicError("42101-2345678-9")).toBeNull();
    expect(cnicError("4210123456789")).toBeNull();
  });

  it("refuses a value of the wrong length", () => {
    expect(cnicError("42101-2345678-")).toMatch(/13 digits/);
    expect(cnicError("1234")).toMatch(/13 digits/);
    expect(cnicError("42101234567890")).toBeNull(); // truncated to 13, not an error
  });

  it("treats an absent CNIC as fine, because it is optional in several forms", () => {
    // `employees.cnic` is nullable for this reason. Requiredness is a per-form
    // decision, not a property of the field.
    expect(cnicError("")).toBeNull();
    expect(cnicError(null)).toBeNull();
    expect(cnicError(undefined)).toBeNull();
  });
});

describe("phone format", () => {
  it("accepts the shapes people actually write", () => {
    expect(phoneError("03001234567")).toBeNull();
    expect(phoneError("0300 123 4567")).toBeNull();
    expect(phoneError("+92 300 123 4567")).toBeNull();
    expect(phoneError("(021) 1234567")).toBeNull();
    expect(phoneError("021-1234567")).toBeNull();
  });

  it("refuses too few digits, which no local number can be", () => {
    expect(phoneError("12345")).toMatch(/7/);
  });

  it("refuses letters, because the field is for a number", () => {
    expect(phoneError("0300 CALL ME")).toMatch(/digits/);
  });

  it("refuses a + that is not at the front", () => {
    expect(phoneError("0300+1234567")).toMatch(/\+/);
  });

  it("treats an absent phone as fine, for the optional fields", () => {
    expect(phoneError("")).toBeNull();
    expect(phoneError(null)).toBeNull();
    expect(phoneError(undefined)).toBeNull();
  });

  it("keeps a leading + on normalisation, for international numbers", () => {
    expect(normalizePhone("+92 300 123 4567")).toBe("+923001234567");
    expect(normalizePhone("0300-1234567")).toBe("03001234567");
  });
});
