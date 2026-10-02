// Statement of account — everything a client currently owes, on one page.
// For the landlord or agent with several invoices outstanding who asks
// "what do I owe you in total?".
import { jsPDF } from "jspdf";
import { invoiceConfig } from "./invoiceConfig";

/**
 * data = { clientName, clientAddr, rows: [{ ref, date, description, total, paid, balance }] }
 */
export function generateStatementPDF(data) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const PW = 595.28, PH = 841.89;
  const NAVY = [26, 61, 79], TEXT = [26, 46, 56], MUTED = [74, 99, 112], ROW = [234, 243, 246];
  const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("STATEMENT OF ACCOUNT", 28, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(invoiceConfig.company, PW - 28, 32, { align: "right" });
  doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), PW - 28, 46, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("STATEMENT FOR", 28, 100);
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.clientName || "Client", 28, 116);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (data.clientAddr) doc.text(doc.splitTextToSize(data.clientAddr, 300), 28, 130);

  const cols = [28, 100, 170, 400, 460, 567];
  let y = 170;
  doc.setFillColor(...NAVY);
  doc.rect(28, y, PW - 56, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ["REF", "DATE", "FOR"].forEach((h, i) => doc.text(h, cols[i] + 6, y + 14));
  doc.text("INVOICED", cols[4] - 6, y + 14, { align: "right" });
  doc.text("PAID", cols[4] + 50, y + 14, { align: "right" });
  doc.text("OWED", cols[5] - 6, y + 14, { align: "right" });
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let total = 0;
  (data.rows || []).forEach((r, i) => {
    if (y > PH - 150) { doc.addPage(); y = 50; }
    if (i % 2 === 0) { doc.setFillColor(...ROW); doc.rect(28, y, PW - 56, 22, "F"); }
    doc.setTextColor(...TEXT);
    doc.text(String(r.ref || ""), cols[0] + 6, y + 14);
    doc.text(String(r.date || ""), cols[1] + 6, y + 14);
    doc.text(doc.splitTextToSize(String(r.description || ""), 215)[0] || "", cols[2] + 6, y + 14);
    doc.text(money(r.total), cols[4] - 6, y + 14, { align: "right" });
    doc.text(money(r.paid), cols[4] + 50, y + 14, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(r.balance), cols[5] - 6, y + 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    total += Number(r.balance) || 0;
    y += 22;
  });

  y += 10;
  doc.setFillColor(...NAVY);
  doc.rect(360, y, PW - 388, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL OWED", 372, y + 18);
  doc.text(money(total), PW - 36, y + 18, { align: "right" });

  y += 50;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("BANK DETAILS", 28, y);
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const b = data.bank || invoiceConfig.bank;
  [`Account holder:  ${b.accountHolder}`, `Account number:  ${b.accountNumber}`, `Sort code:  ${b.sortCode}`, b.bankName && `Bank:  ${b.bankName}`, `Please quote the reference of each invoice you are paying.`]
    .filter(Boolean).forEach((t, i) => doc.text(t, 28, y + 14 + i * 12));

  const safe = String(data.clientName || "Client").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Statement_${safe}.pdf`);
}
