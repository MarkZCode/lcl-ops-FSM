"use client";

// Parse a certificate PDF's text layer (via PDF.js) to extract an expiry date.
// Returns an ISO date string or null.

// UK date patterns: "12/06/2026", "12 June 2026", "12th June 2026", etc.
const DATE_PATTERNS = [
  /expir(?:y|es?|ation)[^:\n]*:?\s*(\d{1,2}[\s/.-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/.-]\d{4})/i,
  /valid\s+until[^:\n]*:?\s*(\d{1,2}[\s/.-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/.-]\d{4})/i,
  /next\s+(?:inspection|service|due)[^:\n]*:?\s*(\d{1,2}[\s/.-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/.-]\d{4})/i,
  /expir(?:y|es?|ation)[^:\n]*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i,
  /valid\s+until[^:\n]*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i,
];

function tryParse(s) {
  if (!s) return null;
  const d = new Date(s.replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, "$3-$2-$1"));
  if (!isNaN(d) && d.getFullYear() > 2000) return d.toISOString().slice(0, 10);
  const d2 = new Date(s);
  if (!isNaN(d2) && d2.getFullYear() > 2000) return d2.toISOString().slice(0, 10);
  return null;
}

export async function extractCertExpiry(file) {
  if (!file || file.type !== "application/pdf") return null;
  try {
    // pdfjs-dist v5 uses ESM — import the build entry point directly.
    // Wrap in try/catch so any import failure is silent (cert expiry just stays unset).
    const pdfjsLib = await import("pdfjs-dist");
    const { getDocument, GlobalWorkerOptions } = pdfjsLib;
    // Use CDN worker matching installed version to avoid bundling it.
    const ver = pdfjsLib.version || "5.4.624";
    GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    for (const pat of DATE_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        const parsed = tryParse(m[1]);
        if (parsed) return parsed;
      }
    }
  } catch {
    // PDF parse failed — return null silently so upload still works.
  }
  return null;
}
