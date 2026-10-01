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

// ── Is this the right certificate for this job? ─────────────────────────
// A certificate filed on the wrong job gets emailed to the wrong landlord.
// This reads the PDF's text and checks two things a person would: is the
// property's postcode in it, and does it look like the kind of certificate
// the job is for. A scanned PDF has no text to read — that returns nulls
// ("couldn't check"), never a false alarm.
const SERVICE_WORDS = {
  GAS: /gas safety|cp\s?12|landlord.{0,20}gas/i,
  GAS_COM: /gas safety|cp\s?42|commercial.{0,20}gas/i,
  EICR: /electrical installation condition|eicr/i,
  EICR_COM: /electrical installation condition|eicr/i,
  EPC: /energy performance/i,
  EPC_COM: /energy performance/i,
  PAT: /portable appliance|pat test/i,
  PAT_COM: /portable appliance|pat test/i,
  FRA: /fire risk/i,
  FRA_COM: /fire risk/i,
  EMLIGHT: /emergency light/i,
  EMLIGHT_COM: /emergency light/i,
  ASBESTOS: /asbestos/i,
};

async function pdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  const { getDocument, GlobalWorkerOptions } = pdfjsLib;
  const ver = pdfjsLib.version || "5.4.624";
  GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.mjs`;
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text;
}

export async function inspectCertificate(file, { postcode, codes = [] } = {}) {
  const out = { postcode: null, service: null };
  if (!file || file.type !== "application/pdf") return out;
  try {
    const text = await pdfText(file);
    if (text.replace(/\s/g, "").length < 80) return out; // scanned — nothing to read
    const pc = String(postcode || "").replace(/\s/g, "").toUpperCase();
    if (pc.length >= 5) out.postcode = text.toUpperCase().replace(/\s/g, "").includes(pc) ? "ok" : "missing";
    const known = codes.filter((c) => SERVICE_WORDS[c]);
    if (known.length) out.service = known.some((c) => SERVICE_WORDS[c].test(text)) ? "ok" : "missing";
  } catch {}
  return out;
}
