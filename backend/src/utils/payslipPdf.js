
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BRAND = "#1769d2";
const BRAND_DARK = "#0f4c9e";
const INK = "#172033";
const MUTED = "#667085";
const RULE = "#d9e1ec";
const SOFT_BLUE = "#f2f7ff";
const SOFT_GRAY = "#f8fafc";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DVERIF_LOGO = resolve(BACKEND_ROOT, "assets/dverif-logo.png");
const PAGE_MARGIN = 46;

/* ---------- helpers ---------- */

function money(value) {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `Rs. ${safeAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function organizationLogoPath(storedPath) {
  const raw = displayValue(storedPath);
  if (!raw) return null;
  const relativePath = raw.replace(/\\/g, "/").replace(/^[/\\]+/, "");
  const candidate = resolve(BACKEND_ROOT, relativePath);
  if (!candidate.startsWith(`${BACKEND_ROOT}${sep}`) || !existsSync(candidate)) return null;
  return candidate;
}

/** Scales an image to fit inside maxW x maxH while keeping its aspect ratio. */
function fitImage(doc, path, maxW, maxH) {
  const img = doc.openImage(path);
  const scale = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * scale, h: img.height * scale };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred ? `${ONES[hundred]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean).join(" ");
}

/** Pakistani numbering: thousand, lakh, crore. */
function amountInWords(value) {
  const amount = Math.max(0, Number(value ?? 0) || 0);
  const rupees = Math.floor(amount);
  const paisa = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paisa === 0) return "Zero Rupees Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts = [
    crore ? `${belowThousand(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
  const paisaText = paisa ? ` and ${belowHundred(paisa)} Paisa` : "";
  return `${parts || "Zero"} Rupees${paisaText} Only`;
}

/* ---------- drawing blocks ---------- */

function drawHeader(doc, { organization, period, logoPath }) {
  const pageWidth = doc.page.width;
  let logoBlock = 0;
  if (logoPath) {
    try {
      const { w, h } = fitImage(doc, logoPath, 96, 62);
      doc.image(logoPath, PAGE_MARGIN, 34 + (62 - h) / 2, { width: w, height: h });
      logoBlock = w + 16;
    } catch {
      // Fall back to the organization name only when the image is unreadable.
    }
  }

  const nameX = PAGE_MARGIN + logoBlock;
  const nameWidth = pageWidth - nameX - PAGE_MARGIN - 190;
  doc.font("Helvetica-Bold").fontSize(15);
  const nameHeight = Math.min(doc.heightOfString(organization, { width: nameWidth }), 36);
  doc.fillColor(INK).text(organization, nameX, 42, { width: nameWidth, height: 36, ellipsis: true });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("Employee Salary Statement", nameX, 42 + nameHeight + 4, { width: nameWidth, lineBreak: false });

  const rightX = pageWidth - PAGE_MARGIN - 180;
  doc.font("Helvetica-Bold").fontSize(24).fillColor(BRAND)
    .text("PAYSLIP", rightX, 36, { width: 180, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED)
    .text("PAY PERIOD", rightX, 68, { width: 180, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK)
    .text(period, rightX, 80, { width: 180, align: "right", lineBreak: false });

  doc.moveTo(PAGE_MARGIN, 106).lineTo(pageWidth - PAGE_MARGIN, 106)
    .lineWidth(2).strokeColor(BRAND).stroke();
  return 106;
}

function drawEmployeeCard(doc, fields, y) {
  const contentW = doc.page.width - PAGE_MARGIN * 2;
  const pad = 16;
  const colGap = 20;
  const colW = (contentW - pad * 2 - colGap) / 2;

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BRAND)
    .text("EMPLOYEE DETAILS", PAGE_MARGIN, y, { lineBreak: false, characterSpacing: 0.6 });
  y += 16;

  // measure rows first so the card background fits the content
  const rows = [];
  for (let i = 0; i < fields.length; i += 2) {
    const pair = fields.slice(i, i + 2);
    doc.font("Helvetica-Bold").fontSize(10.5);
    const heights = pair.map((f) => doc.heightOfString(f.value, { width: colW, lineGap: 2 }));
    rows.push({ pair, height: 14 + Math.max(...heights) + 10 });
  }
  const cardH = pad + rows.reduce((sum, r) => sum + r.height, 0) + pad - 10;
  doc.roundedRect(PAGE_MARGIN, y, contentW, cardH, 8)
    .lineWidth(0.8).fillAndStroke(SOFT_GRAY, RULE);

  let rowY = y + pad;
  for (const row of rows) {
    row.pair.forEach((field, idx) => {
      const x = PAGE_MARGIN + pad + idx * (colW + colGap);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED)
        .text(field.label.toUpperCase(), x, rowY, { width: colW, lineBreak: false, characterSpacing: 0.4 });
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK)
        .text(field.value, x, rowY + 12, { width: colW, lineGap: 2 });
    });
    rowY += row.height;
  }
  return y + cardH;
}

/**
 * A titled panel of money rows and a total.
 *
 * `rows` now size themselves — the breakdown stopped being two fixed lines when
 * the payslip started showing every allowance and deduction by name, and a long
 * component list would have been silently clipped by the old `rowCount`.
 *
 * `source` renders under the label when the caller supplies one. It is the
 * provenance of the line — which salary component produced it, or whether it
 * came from attendance, leave or an approved claim — because "Transport
 * allowance 15,000" says what, and "Salary component" says why the number is
 * that. The basis ("2 days", "3 late arrivals", "2 claims") is the unit behind
 * the amount and is drawn alongside it, so a reader can see what was counted.
 */
function drawPanel(doc, { x, y, width, title, rows, totalLabel, totalAmount }) {
  const headH = PANEL_HEAD_H;
  const rowH = PANEL_ROW_H;
  const totalH = PANEL_TOTAL_H;
  const bodyH = Math.max(rows.length, 1) * rowH;

  // outer border + header bar
  doc.roundedRect(x, y, width, headH + bodyH + totalH, 8).lineWidth(0.8).strokeColor(RULE).stroke();
  doc.save();
  doc.roundedRect(x, y, width, headH, 8).clip();
  doc.rect(x, y, width, headH).fill(BRAND);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff")
    .text(title.toUpperCase(), x + 14, y + 9, { lineBreak: false, characterSpacing: 0.8 });
  doc.text("AMOUNT", x + width - 14 - 90, y + 9, { width: 90, align: "right", lineBreak: false, characterSpacing: 0.8 });

  // rows
  for (let i = 0; i < Math.max(rows.length, 1); i += 1) {
    const rowY = y + headH + i * rowH;
    if (i % 2 === 1) doc.rect(x + 0.5, rowY, width - 1, rowH).fill(SOFT_GRAY);
    const row = rows[i];
    if (!row) continue;
    // The name on the first line, its provenance beneath it, in the muted face
    // and smaller than the amount. Row height accommodates both; a single line
    // with both concatenated would truncate long component names.
    const labelW = width * 0.56;
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text(row.label, x + 14, rowY + 7, { width: labelW - 10, lineBreak: false });
    if (row.source) {
      doc.font("Helvetica").fontSize(7.5).fillColor("#8a93a6")
        .text(row.source, x + 14, rowY + 19, { width: labelW - 10, lineBreak: false });
    }
    doc.font("Helvetica").fontSize(9.5).fillColor(INK)
      .text(row.amount, x + width - 14 - 130, rowY + 9, { width: 130, align: "right", lineBreak: false });
    if (row.basis) {
      doc.font("Helvetica").fontSize(7.5).fillColor("#8a93a6")
        .text(row.basis, x + width - 14 - 130, rowY + 20, { width: 130, align: "right", lineBreak: false });
    }
  }

  // total row
  const totalY = y + headH + bodyH;
  doc.save();
  doc.roundedRect(x, y, width, headH + bodyH + totalH, 8).clip();
  doc.rect(x, totalY, width, totalH).fill(SOFT_BLUE);
  doc.restore();
  doc.moveTo(x, totalY).lineTo(x + width, totalY).lineWidth(0.8).strokeColor(RULE).stroke();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK)
    .text(totalLabel, x + 14, totalY + 10, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND)
    .text(totalAmount, x + width - 14 - 130, totalY + 10, { width: 130, align: "right", lineBreak: false });

  return y + headH + bodyH + totalH;
}

function drawNetSalary(doc, netAmount, y) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  const height = 64;
  doc.roundedRect(PAGE_MARGIN, y, width, height, 10).fill(BRAND);
  doc.roundedRect(PAGE_MARGIN, y, 6, height, 3).fill(BRAND_DARK);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#cfe1ff")
    .text("NET SALARY PAYABLE", PAGE_MARGIN + 24, y + 16, { lineBreak: false, characterSpacing: 0.8 });
  doc.font("Helvetica").fontSize(8).fillColor("#cfe1ff")
    .text("Total earnings minus deductions", PAGE_MARGIN + 24, y + 33, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(21).fillColor("#ffffff")
    .text(money(netAmount), PAGE_MARGIN + 24, y + 20, {
      width: width - 48,
      align: "right",
      lineBreak: false,
    });

  const wordsY = y + height + 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED)
    .text("AMOUNT IN WORDS", PAGE_MARGIN, wordsY, { lineBreak: false, characterSpacing: 0.5 });
  doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(INK)
    .text(amountInWords(netAmount), PAGE_MARGIN, wordsY + 12, { width });
  return wordsY + 32;
}

function drawFooter(doc, generatedDate, pageNumber, pageCount) {
  const pageWidth = doc.page.width;
  const right = pageWidth - PAGE_MARGIN;
  const contentW = pageWidth - PAGE_MARGIN * 2;
  const y = doc.page.height - 108;

  // allow drawing inside the bottom margin without triggering a new page
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).lineWidth(0.8).strokeColor(RULE).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text("Computer-generated payslip, no signature required", PAGE_MARGIN, y + 10, {
      width: contentW, align: "center", lineBreak: false,
    });
  doc.text("Confidential, for the named employee only", PAGE_MARGIN, y + 22, {
    width: contentW, align: "center", lineBreak: false,
  });

  // bottom row: [big logo] Powered by Dverif  ...  Generated date | Page x of y
  const rowTop = y + 40;
  const rowH = 38;
  let textX = PAGE_MARGIN;
  if (existsSync(DVERIF_LOGO)) {
    try {
      const { w, h } = fitImage(doc, DVERIF_LOGO, 110, rowH);
      doc.image(DVERIF_LOGO, PAGE_MARGIN, rowTop + (rowH - h) / 2, { width: w, height: h });
      textX = PAGE_MARGIN + w + 10;
    } catch {
      // Keep the footer usable if the bundled logo asset is corrupt.
    }
  }
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK)
    .text("Powered by Dverif", textX, rowTop + rowH / 2 - 6, { lineBreak: false });

  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text(`Generated ${generatedDate}`, right - 180, rowTop + rowH / 2 - 9, {
      width: 180, align: "right", lineBreak: false,
    });
  doc.text(`Page ${pageNumber} of ${pageCount}`, right - 180, rowTop + rowH / 2 + 3, {
    width: 180, align: "right", lineBreak: false,
  });

  doc.page.margins.bottom = savedBottom;
}

/* ---------- main ---------- */

/**
 * Human wording for a line's `source` column.
 *
 * `salary_record_lines.source` is a machine token (basic, component,
 * auto_unpaid_leave, auto_absenteeism, auto_late, auto_overtime, auto_expense,
 * manual). A recruiter reading a payslip does not know what `auto_absenteeism`
 * means, and printing the token verbatim is the kind of leak that makes a
 * payment document feel like a debug dump. These say what produced the line, which
 * is the question the column answers.
 */
const SOURCE_LABELS = {
  basic: "Salary record",
  component: "Salary component",
  auto_unpaid_leave: "Unpaid leave",
  auto_absenteeism: "Absent days",
  auto_late: "Late arrivals",
  auto_overtime: "Approved overtime",
  auto_expense: "Expense claims",
  manual: "Manual adjustment",
};

const BASIS_UNIT_LABELS = {
  days: "days",
  hours: "hours",
  late_arrivals: "late arrivals",
  claims: "claims",
};

/**
 * What a line's basis means in words.
 *
 * `basis_value` is the count and `basis_unit` is what was counted — 2 days, 3
 * late arrivals, 2 claims. Showing the count without the unit ("Late arrivals 3")
 * reads as an amount, which is exactly the ambiguity the unit column exists to
 * remove. A basis is omitted entirely rather than guessed when the unit is missing.
 */
function basisLabel(line) {
  const unit = line.basis_unit ? BASIS_UNIT_LABELS[line.basis_unit] : null;
  const value = line.basis_value;
  if (!unit || value === null || value === undefined || String(value).trim() === "") return null;
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return `${count} ${unit}`;
}

/**
 * Total height a panel will occupy, so the caller can chain a second one under
 * it without drawPanel having to hand back its geometry.
 *
 * Kept beside drawPanel and derived from its own constants rather than being a
 * second copy of them — the three measurements below are declared once and both
 * functions read them, so a change to the row height moves the stack with it.
 */
const PANEL_HEAD_H = 26;
const PANEL_ROW_H = 27;
const PANEL_TOTAL_H = 30;

function panelHeight(rows) {
  return PANEL_HEAD_H + Math.max(rows.length, 1) * PANEL_ROW_H + PANEL_TOTAL_H;
}

/** Split the stored lines into the earnings and deductions the panels show. */
function splitLines(lines) {
  const earnings = [];
  const deductions = [];
  for (const line of lines ?? []) {
    const row = {
      label: String(line.label ?? "Line item"),
      amount: money(line.amount),
      source: line.source ? (SOURCE_LABELS[line.source] ?? line.source) : null,
      basis: basisLabel(line),
    };
    if (String(line.type) === "deduction") deductions.push(row);
    else earnings.push(row);
  }
  return { earnings, deductions };
}

/** Builds a printable A4 payslip using values stored on the salary record,
 *  and the itemised lines that produced its totals. */
export async function generatePayslipPdf({ record, employeeName, organizationName }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: { Title: "Salary Payslip", Author: "Dverif" },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((res) => doc.on("end", res));

  const pageWidth = doc.page.width;
  const contentW = pageWidth - PAGE_MARGIN * 2;
  const organization = displayValue(organizationName) || "Organization";
  const monthIndex = Number(record.month) - 1;
  const period = `${MONTHS[monthIndex] ?? record.month} ${record.year}`;

  let y = drawHeader(doc, {
    organization,
    period,
    logoPath: organizationLogoPath(record.organization_logo),
  });

  y += 20;
  const fields = [
    ["Employee name", employeeName],
    ["CNIC", record.employee_cnic],
    ["Phone", record.employee_phone],
    ["Designation", record.designation],
    ["Department", record.department],
  ].filter(([, value]) => displayValue(value)).map(([label, value]) => ({ label, value: displayValue(value) }));
  if (fields.length) y = drawEmployeeCard(doc, fields, y);

  y += 22;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BRAND)
    .text("SALARY BREAKDOWN", PAGE_MARGIN, y, { lineBreak: false, characterSpacing: 0.6 });
  y += 16;

  const basic = Number(record.basic_salary ?? 0) || 0;
  const allowances = Number(record.allowances ?? 0) || 0;
  const totalEarnings = basic + allowances;
  const gap = 16;
  const panelW = (contentW - gap) / 2;

  /*
   * ITEMISED WHEN THE LINES EXIST, rolled up when they do not.
   *
   * A record generated before `salary_record_lines` existed — every record
   * created by the original payroll flow — has no line rows, and rendering an
   * empty earnings panel would be worse than the aggregate it replaces. Those
   * records get the old two-row view, so the document never gets worse for
   * being older. Every record generated since gets every allowance and deduction
   * by name, with its source and its basis.
   *
   * THE TOTALS COME FROM THE RECORD, NOT FROM THE LINES. They are shown as the
   * aggregate that was actually paid, and the lines are the explanation
   * underneath it; re-deriving the total by summing the lines could produce a
   * figure that disagrees with the stored one if a line was ever edited after
   * the fact, and the stored total is what the employee is owed.
   */
  const { earnings, deductions } = splitLines(record.lines);
  const anyLines = earnings.length + deductions.length > 0;

  const earningsRows = anyLines && earnings.length
    ? earnings
    : [
        { label: "Basic salary", amount: money(record.basic_salary), source: null, basis: null },
        { label: "Allowances (total)", amount: money(record.allowances), source: null, basis: null },
      ];
  const deductionRows = anyLines && deductions.length
    ? deductions
    : [{ label: "Deductions (total)", amount: money(record.deductions), source: null, basis: null }];

  /*
   * Two side-by-side panels only fit while both stay short. A record with eight
   * components and six attendance lines cannot be read at half a page width — the
   * names wrap, the amounts collide, and the net salary leaves the page. So once
   * either side needs more than a handful of rows they stack full width instead,
   * which is the same trade the rest of the document already makes and keeps the
   * figures legible. The columns are still balanced by the same gap.
   */
  const stack = Math.max(earningsRows.length, deductionRows.length) > 5;

  if (stack) {
    const earningsEnd = drawPanel(doc, {
      x: PAGE_MARGIN, y, width: contentW, title: "Earnings",
      rows: earningsRows,
      totalLabel: "Total earnings", totalAmount: money(totalEarnings),
    });
    const deductionTop = earningsEnd + 14;
    drawPanel(doc, {
      x: PAGE_MARGIN, y: deductionTop, width: contentW, title: "Deductions",
      rows: deductionRows,
      totalLabel: "Total deductions", totalAmount: money(record.deductions),
    });
    // Same constant drawPanel used, so the stacked layout stays aligned if the
    // row height is ever changed. Duplicating `27` here is the kind of drift
    // that puts a white gap under the last panel a year later.
    y = deductionTop + panelHeight(deductionRows) + 22;
  } else {
    const earningsEnd = drawPanel(doc, {
      x: PAGE_MARGIN, y, width: panelW, title: "Earnings",
      rows: earningsRows,
      totalLabel: "Total earnings", totalAmount: money(totalEarnings),
    });
    drawPanel(doc, {
      x: PAGE_MARGIN + panelW + gap, y, width: panelW, title: "Deductions",
      rows: deductionRows,
      totalLabel: "Total deductions", totalAmount: money(record.deductions),
    });
    y = earningsEnd + 22;
  }
  drawNetSalary(doc, record.net_salary, y);

  const generatedDate = new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    drawFooter(doc, generatedDate, page - range.start + 1, range.count);
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}