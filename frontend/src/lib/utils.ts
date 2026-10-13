import { buildFeatureAccess, type FeatureAccessMap } from "@/lib/featureKeys";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { uiLocale } from "@/i18n";
import { formatCNIC as formatCNICValue } from "@/lib/contactFormat";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) || "/api/v1";
const ASSET_BASE = API_BASE.replace(/\/api\/v1\/?$/, "");

export function resolveAssetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:"))
    return path;
  return `${ASSET_BASE}/${path.replace(/^\//, "")}`;
}

export function formatDate(value?: string | Date | null, locale: string = uiLocale()): string {
  if (!value) return "—";
  try {
    if (typeof value === "string") {
      const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, y, m, d] = match;
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        return dateObj.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
      }
    }
    const d = typeof value === "string" ? new Date(value.replace(" ", "T")) : value;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function formatDateTime(value?: string | Date | null, locale: string = uiLocale()): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? new Date(value.replace(" ", "T")) : value;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatCNIC(value: string): string {
  return formatCNICValue(value);
}

/** Keep only digits from a raw input value (for phone/number fields). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Convert a stored API date value to the YYYY-MM-DD format expected by a date input.
 * The API may return ISO strings such as `2025-06-01T00:00:00.000Z`.
 */
export function normalizeDateInputValue(value?: string | null): string {
  if (!value) return "";
  const match = value.trim().match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

/** Inclusive calendar-day count between two date values (YYYY-MM-DD or ISO). */
export function countDays(startDate: string, endDate: string): number {
  const s = startDate ? new Date(startDate.replace(" ", "T")) : new Date(NaN);
  const e = endDate ? new Date(endDate.replace(" ", "T")) : new Date(NaN);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const sKey = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const eKey = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  return Math.max(0, Math.round((eKey - sKey) / 86400000) + 1);
}

export function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

/** Turn a stored slug like "software_house" into a display label "Software House". */
export function prettySlug(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format a money amount for display.
 *
 * ADDED FOR ASSETS, and deliberately in one place. Money is the first thing a
 * spreadsheet gets wrong by rendering ad-hoc: one page shows "1234.5", the next
 * "PKR 1,234.50", and an auditor cannot add the column up. This is the only
 * currency formatter in the app, so a second one appearing elsewhere is a bug.
 *
 * Nullish renders as an em dash rather than "0" or "NaN": an asset with no
 * recorded cost is UNKNOWN, and printing 0 asserts a value nobody entered.
 *
 * Accepts a string because DECIMAL columns arrive from MySQL as strings.
 * A value that will not parse renders as the dash too, rather than "NaN".
 */
export function formatCurrency(
  value?: number | string | null,
  locale: string = uiLocale(),
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // An unknown locale must not blank the cell; the bare number still reads.
    return n.toFixed(2);
  }
}

/** Normalize a feature_access value (object or JSON string) into booleans. */
/**
 * Normalise a raw feature_access value into a complete boolean map.
 *
 * Now a thin re-export of buildFeatureAccess(). It used to hand-write the six keys
 * it knew about, which made it a FIFTH copy of the permission list and the reason
 * adding the HR-module keys failed to compile in three files at once. The behaviour
 * is identical for the pre-existing keys; the difference is that a new key now
 * arrives here automatically.
 *
 * Kept under its own name because eleven files import it from this module.
 */
export function parseFeatureAccess(raw: unknown): FeatureAccessMap {
  return buildFeatureAccess(raw);
}
