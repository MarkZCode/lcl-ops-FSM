// Faithful port of the official LCL invoice PDF generator (jsPDF).
// Layout, colours, bank block and footer match Invoice #344 exactly.
import { jsPDF } from "jspdf";
import { LOGO_B64 } from "./logoBase64";
import { invoiceConfig } from "./invoiceConfig";

function fmtDate(raw) {
  const d = raw ? new Date(raw + "T00:00:00") : new Date();
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
 *   invNo, dateISO, clientName, clientAddr, propAddr1, propAddr2,
 *   notes, taxOn, taxRate (percent), lines: [{ desc, price, qty }]
 * }
 */
// opts.output: "save" (default, downloads) | "base64" (returns { filename, base64 }
// for attaching to an email).
export function generateInvoicePDF(data, opts = {}) {
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

  const isQuote = data.docType === "quote";
  // Every email slot on a money document (invoice / receipt) points at the
  // accounts inbox — header, remittance line and footer alike — so a client
  // replying about payment always reaches billing. Quotes keep the general
  // address: a reply there is a sales conversation, not a payment one.
  const contactEmail = isQuote
    ? invoiceConfig.email
    : (invoiceConfig.accountsEmail || invoiceConfig.email);
  const docTitle = isQuote ? "QUOTE" : "INVOICE";
  const numLabel = isQuote ? "Quote Ref" : "Invoice No";
  const invNo = data.invNo || "001";
  const clientNm = data.clientName || "Client";
  const clientAd = data.clientAddr || "";
  const propA1 = data.propAddr1 || "";
  const propA2 = data.propAddr2 || "";
  const notes = data.notes || "";
  const taxOn = Boolean(data.taxOn);
  const taxRate = (parseFloat(data.taxRate) || 0) / 100;
  const dateStr = fmtDate(data.dateISO);

  // HEADER
  const HH = 90;
  sf(NAVY);
  doc.rect(0, 0, PW, HH, "F");
  // White rounded chip behind the logo so the navy logo mark stays visible
  // against the navy header band.
  const LZ = 58; // chip size
  const LX = 24;
  const LY = (HH - LZ) / 2;
  sf(WHITE);
  doc.roundedRect(LX, LY, LZ, LZ, 8, 8, "F");
  try {
    const pad = 5;
    doc.addImage(
      "data:image/png;base64," + LOGO_B64,
      "PNG",
      LX + pad,
      LY + pad,
      LZ - pad * 2,
      LZ - pad * 2
    );
  } catch (e) {}

  st(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(invoiceConfig.company, 86, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  st(BLUEL);
  doc.text(invoiceConfig.address, 86, 44);
  doc.text(`${contactEmail}  |  ${invoiceConfig.phone}`, 86, 55);
  if (invoiceConfig.website) doc.text(invoiceConfig.website, 86, 66);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  st(WHITE);
  doc.text(docTitle, PW - 26, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  st(BLUEL);
  doc.text(`${numLabel}: ${invNo}`, PW - 26, 55, { align: "right" });
  doc.text(`Date Issued: ${dateStr}`, PW - 26, 67, { align: "right" });

  // BILL TO / PROPERTY
  const BY = HH,
    BH = clientAd ? 80 : 64;
  sf(BGLIGHT);
  doc.rect(0, BY, PW, BH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("BILL TO", 28, BY + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  st(TEXTDK);
  doc.text(clientNm, 28, BY + 30);
  if (clientAd) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTMD);
    doc.text(clientAd, 28, BY + 44);
  }

  sd(DIVIDER);
  doc.setLineWidth(0.6);
  doc.line(PW / 2, BY + 8, PW / 2, BY + BH - 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(TEXTMD);
  doc.text("PROPERTY ADDRESS", PW - 28, BY + 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  st(TEXTDK);
  if (propA1) doc.text(propA1, PW - 28, BY + 30, { align: "right" });
  if (propA2) doc.text(propA2, PW - 28, BY + 44, { align: "right" });

  // TABLE HEADER
  const THY = BY + BH + 10;
  const THH = 26;
  sf(TEAL);
  doc.rect(28, THY, PW - 56, THH, "F");

  const COLS = [28, 330, 420, 492, PW - 28];
  const AL = ["left", "right", "center", "right"];
  const HDRS = ["DESCRIPTION", "PRICE", "QTY", "TOTAL"];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  st(WHITE);
  HDRS.forEach((h, i) => {
    const cl = COLS[i],
      cr = COLS[i + 1],
      mid = THY + THH / 2 + 3.5;
    if (AL[i] === "left") doc.text(h, cl + 8, mid);
    else if (AL[i] === "right") doc.text(h, cr - 8, mid, { align: "right" });
    else doc.text(h, (cl + cr) / 2, mid, { align: "center" });
  });

  // ROWS
  let sub = 0;
  const rowData = (data.lines || [])
    .filter((l) => l.desc || l.price)
    .map((l) => {
      const p = parseFloat(l.price) || 0;
      const q = parseFloat(l.qty) || 1;
      // Discounted lines (waived parking/congestion) show their original price
      // but contribute £0 to the running subtotal.
      const t = l.discounted ? 0 : p * q;
      sub += t;
      const amount = l.discounted ? "Discounted" : `£${t.toFixed(2)}`;
      return [l.desc || "", `£${p.toFixed(2)}`, String(Math.round(q)), amount];
    });

  const RH = 28;
  let cy = THY + THH;
  rowData.forEach((row, ri) => {
    sf(ri % 2 === 0 ? BGROW : WHITE);
    doc.rect(28, cy, PW - 56, RH, "F");
    sd(ROWLN);
    doc.setLineWidth(0.4);
    doc.line(28, cy, PW - 28, cy);
    row.forEach((t, i) => {
      const cl = COLS[i],
        cr = COLS[i + 1],
        ry = cy + RH / 2 + 3.5;
      if (i === 3) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        st(TEAL);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        st(TEXTDK);
      }
      if (AL[i] === "left") doc.text(t, cl + 8, ry);
      else if (AL[i] === "right") doc.text(t, cr - 8, ry, { align: "right" });
      else doc.text(t, (cl + cr) / 2, ry, { align: "center" });
    });
    cy += RH;
  });
  sd(ROWLN);
  doc.setLineWidth(0.4);
  doc.line(28, cy, PW - 28, cy);

  // TOTALS
  let ty = cy + 16;
  if (taxOn) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTMD);
    doc.text("Subtotal", 390, ty);
    st(TEXTDK);
    doc.text(`£${sub.toFixed(2)}`, PW - 28, ty, { align: "right" });
    ty += 18;
    const taxAmt = sub * taxRate;
    st(TEXTMD);
    doc.text(`VAT (${Math.round(taxRate * 100)}%)`, 390, ty);
    st(TEXTDK);
    doc.text(`£${taxAmt.toFixed(2)}`, PW - 28, ty, { align: "right" });
    sub += taxAmt;
    ty += 6;
  }
  // No tax/VAT line is shown by default — documents sent to clients don't
  // mention VAT (prices are all-inclusive).

  ty += 6;
  sf(TEAL);
  doc.rect(382, ty, PW - 28 - 382 + 8, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  st(WHITE);
  doc.text(isQuote ? "QUOTE TOTAL" : "TOTAL DUE", 390, ty + 17);
  doc.setFontSize(11);
  doc.text(`£${sub.toFixed(2)}`, PW - 28, ty + 17, { align: "right" });
  ty += 26;

  // NOTES
  if (notes.trim()) {
    ty += 12;
    const wrapped = doc.splitTextToSize(notes.trim(), PW - 100);
    const NH = Math.max(44, wrapped.length * 13 + 22);
    sf(BGLIGHT);
    doc.rect(28, ty, PW - 56, NH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    st(TEXTMD);
    doc.text("NOTES", 40, ty + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTDK);
    doc.text(wrapped, 40, ty + 27);
    ty += NH;
  }

  if (isQuote) {
    // QUOTE: validity note instead of bank/remittance details.
    ty += 14;
    const QH = 46;
    sf(BGLIGHT);
    doc.rect(28, ty, PW - 56, QH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    st(TEXTMD);
    doc.text("QUOTATION", 40, ty + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTDK);
    doc.text(
      "This quotation is valid for 30 days. To accept, please reply to confirm and we'll book you in.",
      40,
      ty + 31
    );
  } else {
    // BANK / REMITTANCE
    ty += 14;
    const hasIban = Boolean(invoiceConfig.bank.iban);
    const BOTH = hasIban ? 92 : 74;
    sf(BGLIGHT);
    doc.rect(28, ty, PW - 56, BOTH, "F");
    sd(DIVIDER);
    doc.setLineWidth(0.5);
    doc.line(PW / 2, ty + 6, PW / 2, ty + BOTH - 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    st(TEXTMD);
    doc.text("BANK DETAILS", 40, ty + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    st(TEXTDK);
    doc.text(`Account Holder:  ${invoiceConfig.bank.accountHolder}`, 40, ty + 25);
    doc.text(`Account Number:  ${invoiceConfig.bank.accountNumber}`, 40, ty + 36);
    doc.text(`Sort Code:  ${invoiceConfig.bank.sortCode}`, 40, ty + 47);
    if (invoiceConfig.bank.bankName) {
      doc.text(`Bank:  ${invoiceConfig.bank.bankName}`, 40, ty + 58);
    }
    if (invoiceConfig.bank.iban) {
      doc.text(`IBAN:  ${invoiceConfig.bank.iban}`, 40, ty + 69);
    }
    if (invoiceConfig.bank.bic) {
      doc.text(`BIC/SWIFT:  ${invoiceConfig.bank.bic}`, 40, ty + 80);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    st(TEXTMD);
    doc.text("REMITTANCE", PW - 36, ty + 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    st(TEXTDK);
    doc.text("Please send remittance confirmation to:", PW - 36, ty + 27, { align: "right" });
    st(TEAL);
    doc.text(invoiceConfig.remittanceEmail, PW - 36, ty + 39, { align: "right" });
  }

  // FOOTER
  const FY = PH - 32;
  sf(NAVY);
  doc.rect(0, FY, PW, 32, "F");
  // No company registration number — removed entirely at the owner's request.
  // Registered Office moves up to the first footer row so it sits level with
  // the phone number on the right instead of leaving a blank line where the
  // registration used to be.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  st(BLUEF);
  doc.text(
    `Registered Office: ${invoiceConfig.company}, ${invoiceConfig.address}`,
    28,
    FY + 12
  );
  doc.text(invoiceConfig.phone, PW - 28, FY + 12, { align: "right" });
  doc.text(contactEmail, PW - 28, FY + 23, { align: "right" });

  const safeName = clientNm.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `${isQuote ? "Quote" : "Invoice"}_${invNo}_${safeName}.pdf`;

  if (opts.output === "base64") {
    // "data:application/pdf;filename=...;base64,XXXX" -> raw base64
    const uri = doc.output("datauristring");
    return { filename, base64: uri.substring(uri.indexOf(",") + 1) };
  }
  doc.save(filename);
}
