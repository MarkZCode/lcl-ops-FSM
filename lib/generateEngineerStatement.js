// Engineer payment statement PDF — sent to subcontractor engineers when LCL
// pays them for a period. Mirrors the look of generateInvoice.js but only
// ever shows the ENGINEER'S side of the maths:
//   - their fee per job (fixed gas rate, % cut, or weekly retainer)
//   - their VAT (if VAT-registered) on that fee only
//   - any approved parking reimbursement
// It NEVER shows the customer price, the job's total revenue, or LCL's
// margin/share — those are internal figures only.
import { jsPDF } from "jspdf";
import { LOGO_B64 } from "./logoBase64";
import { invoiceConfig } from "./invoiceConfig";

function fmtDate(raw) {
  const d = raw ? new Date(raw) : new Date();
  const day = d.getDate();
  const m = d.toLocaleString("default", { month: "long" });
  const y = d.getFullYear();
  const v = day % 100;
  const s = ["th", "st", "nd", "rd"];
  const sf = s[(v - 20) % 10] || s[v] || s[0];
  return `${day}${sf} ${m} ${y}`;
}

/**
 * data = {
 *   statementNo, dateISO, periodLabel,
 *   engineer: { name, company, bankName, bankAccountName, bankSortCode, bankAccountNumber },
 *   jobs: [{ jobId, date, description, net, vat, parking, total }],
 *   totals: { net, vat, parking, total },
 * }
 */
export function generateEngineerStatementPDF(data, opts = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const PW = 595.28,
    PH = 841.89;

  const NAVY = [26, 61, 79];
  const TEAL = [26, 107, 123];
  const TEXTDK = [26, 46, 56];
  const TEXTMD = [74, 99, 112];
  const BGLIGHT = [242, 248, 250];
  const BGROW = [234, 243, 246];
  const WHITE = [255, 255, 255];
  const BLUEL = [180, 210, 220];
  const BLUEF = [136, 184, 196];
  const DIVIDER = [200, 221, 227];
  const ROWLN = [212, 232, 238];

  const sf = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const st = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const sd = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  const eng = data.engineer || {};
  const payeeName = eng.company || eng.name || "Engineer";
  const stmtNo = data.statementNo || "—";
  const dateStr = fmtDate(data.dateISO);
  const jobs = data.jobs || [];
  const totals = data.totals || { net: 0, vat: 0, parking: 0, total: 0 };

  // HEADER
  const HH = 90;
  sf(NAVY);
  doc.rect(0, 0, PW, HH, "F");
  const LZ = 58;
  const LX = 24;
  const LY = (HH - LZ) / 2;
  sf(WHITE);
  doc.roundedRect(LX, LY, LZ, LZ, 8, 8, "F");
  try {
    const pad = 5;
    doc.addImage("data:image/png;base64," + LOGO_B64, "PNG", LX + pad, LY + pad, LZ - pad * 2, LZ - pad * 2);
  } catch (e) {}

  st(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(invoiceConfig.company, 86, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  st(BLUEL);
  doc.text(invoiceConfig.address, 86, 44);
  doc.text(`${invoiceConfig.email}  |  ${invoiceConfig.phone}`, 86, 55);
  if (invoiceConfig.website) doc.text(invoiceConfig.website, 86, 66);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  st(WHITE);
  doc.text("PAYMENT STATEMENT", PW - 26, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  st(BLUEL);
  doc.text(`Statement No: ${stmtNo}`, PW - 26, 55, { align: "right" });
  doc.text(`Date Issued: ${dateStr}`, PW - 26, 67, { align: "right" });

  // PAID TO / PERIOD
  const BY = HH,
    BH = 64;
  sf(BGLIGHT);
  doc.rect(0, BY, PW, BH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("PAID TO", 28, BY + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  st(TEXTDK);
  doc.text(payeeName, 28, BY + 30);
  if (eng.company && eng.name && eng.company !== eng.name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTMD);
    doc.text(`Engineer: ${eng.name}`, 28, BY + 44);
  }

  sd(DIVIDER);
  doc.setLineWidth(0.6);
  doc.line(PW / 2, BY + 8, PW / 2, BY + BH - 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("PERIOD", PW - 28, BY + 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  st(TEXTDK);
  doc.text(data.periodLabel || "", PW - 28, BY + 30, { align: "right" });

  // TABLE HEADER
  const THY = BY + BH + 10;
  const THH = 26;
  sf(TEAL);
  doc.rect(28, THY, PW - 56, THH, "F");

  // Job | Date | Description | Fee | VAT | Parking | Total
  const COLS = [28, 110, 175, 365, 425, 485, PW - 28];
  const AL = ["left", "left", "left", "right", "right", "right"];
  const HDRS = ["JOB", "DATE", "DESCRIPTION", "FEE", "VAT", "TOTAL"];
  // Re-map to 6 visible columns: Job, Date, Description, Fee, VAT+Parking combined, Total
  const COLS6 = [28, 95, 165, 360, 430, 500, PW - 28];
  const HDRS6 = ["JOB", "DATE", "DESCRIPTION", "FEE", "PARKING", "TOTAL"];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(WHITE);
  HDRS6.forEach((h, i) => {
    const cl = COLS6[i],
      cr = COLS6[i + 1],
      mid = THY + THH / 2 + 3.5;
    if (AL[i] === "left") doc.text(h, cl + 8, mid);
    else doc.text(h, cr - 8, mid, { align: "right" });
  });

  // ROWS — one row per job, plus a sub-row showing VAT under the fee where
  // applicable so nothing about the customer price is ever shown.
  const RH = 28;
  let cy = THY + THH;
  jobs.forEach((j, ri) => {
    sf(ri % 2 === 0 ? BGROW : WHITE);
    doc.rect(28, cy, PW - 56, RH, "F");
    sd(ROWLN);
    doc.setLineWidth(0.4);
    doc.line(28, cy, PW - 28, cy);

    const ry = cy + RH / 2 + 3.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTDK);
    doc.text(j.jobId || "", COLS6[0] + 8, ry);
    doc.text(j.date ? fmtDate(j.date) : "—", COLS6[1] + 8, ry);

    let desc = j.description || "";
    if (j.vat > 0) desc += ` (+VAT £${j.vat.toFixed(2)})`;
    const wrappedDesc = doc.splitTextToSize(desc, COLS6[3] - COLS6[2] - 12);
    doc.text(wrappedDesc[0] || "", COLS6[2] + 8, ry);

    doc.text(`£${(j.net + (j.vat || 0)).toFixed(2)}`, COLS6[4] - 8, ry, { align: "right" });
    doc.text(j.parking > 0 ? `£${j.parking.toFixed(2)}` : "—", COLS6[5] - 8, ry, { align: "right" });
    doc.setFont("helvetica", "bold");
    st(TEAL);
    doc.text(`£${j.total.toFixed(2)}`, COLS6[6] - 8, ry, { align: "right" });

    cy += RH;
  });
  sd(ROWLN);
  doc.setLineWidth(0.4);
  doc.line(28, cy, PW - 28, cy);

  // TOTALS
  let ty = cy + 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  st(TEXTMD);
  doc.text("Fees (incl. VAT)", 360, ty);
  st(TEXTDK);
  doc.text(`£${(totals.net + (totals.vat || 0)).toFixed(2)}`, PW - 28, ty, { align: "right" });
  ty += 18;
  st(TEXTMD);
  doc.text("Parking reimbursed", 360, ty);
  st(TEXTDK);
  doc.text(`£${(totals.parking || 0).toFixed(2)}`, PW - 28, ty, { align: "right" });
  ty += 6;

  ty += 12;
  sf(TEAL);
  doc.rect(352, ty, PW - 28 - 352 + 8, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  st(WHITE);
  doc.text("TOTAL PAID", 360, ty + 17);
  doc.setFontSize(11);
  doc.text(`£${totals.total.toFixed(2)}`, PW - 28, ty + 17, { align: "right" });
  ty += 26;

  // BANK DETAILS (engineer's own — for their records)
  ty += 14;
  const BOTH = 74;
  sf(BGLIGHT);
  doc.rect(28, ty, PW - 56, BOTH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("PAID VIA BANK TRANSFER TO", 40, ty + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  st(TEXTDK);
  doc.text(`Account Name:  ${eng.bankAccountName || "—"}`, 40, ty + 27);
  doc.text(`Sort Code:  ${eng.bankSortCode || "—"}`, 40, ty + 39);
  doc.text(`Account Number:  ${eng.bankAccountNumber || "—"}`, 40, ty + 51);
  if (eng.bankName) doc.text(`Bank:  ${eng.bankName}`, 40, ty + 63);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("QUERIES", PW - 36, ty + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  st(TEXTDK);
  doc.text("If any figures look incorrect, please contact:", PW - 36, ty + 27, { align: "right" });
  st(TEAL);
  doc.text(invoiceConfig.email, PW - 36, ty + 39, { align: "right" });

  // FOOTER
  const FY = PH - 32;
  sf(NAVY);
  doc.rect(0, FY, PW, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  st(BLUEL);
  doc.text(`Company Registration Number: ${invoiceConfig.companyReg}`, 28, FY + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  st(BLUEF);
  doc.text(`Registered Office: ${invoiceConfig.company}, ${invoiceConfig.address}`, 28, FY + 23);
  doc.text(invoiceConfig.phone, PW - 28, FY + 12, { align: "right" });
  doc.text(invoiceConfig.email, PW - 28, FY + 23, { align: "right" });

  const safeName = payeeName.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Statement_${safeName}_${(data.periodLabel || "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  if (opts.output === "base64") {
    const uri = doc.output("datauristring");
    return { filename, base64: uri.substring(uri.indexOf(",") + 1) };
  }
  doc.save(filename);
}
