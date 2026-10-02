import { brandedHtml } from "./emailBrand";

// Email tracking helpers — open pixel, link rewriting, unsubscribe footer.
// All server-side only; never imported in client components.

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://lcl-ops.vercel.app");

// Convert plain text to minimal HTML suitable for email clients.
// Keeps paragraphs, preserves newlines inside paragraphs.
export function textToHtml(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paras = escaped.split(/\n{2,}/);
  const inner = paras.map((p) => `<p style="margin:0 0 1em 0">${p.replace(/\n/g, "<br>")}</p>`).join("\n");
  return inner;
}

// Rewrite all http/https links in an HTML string to pass through the click tracker.
export function rewriteLinks(html, sendId) {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_, url) => `href="${APP_URL}/api/track/click?id=${encodeURIComponent(sendId)}&url=${encodeURIComponent(url)}"`
  );
}

// Build the full HTML email with tracking pixel + unsubscribe footer.
export function buildHtml({ text, sendId, fromName, unsubToken, plain = false }) {
  const pixelUrl = `${APP_URL}/api/track/open?id=${encodeURIComponent(sendId)}`;
  const unsubUrl = `${APP_URL}/unsubscribe?token=${encodeURIComponent(unsubToken || sendId)}`;
  // The branded layout every client email shares (lib/emailBrand.js), with
  // the open pixel and the unsubscribe line this route adds.
  // Outreach to people who aren't clients yet stays a plain, personal-looking
  // email — a designed layout reads as marketing and lands in Promotions.
  if (plain) {
    return rewriteLinks(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;margin:0;padding:24px">${textToHtml(text)}<p style="margin-top:28px;font-size:12px;color:#94a3b8">This email was sent by ${fromName || "Landlord Compliance London"}. If you no longer wish to receive these messages, <a href="${unsubUrl}" style="color:#94a3b8">unsubscribe here</a>.</p><img src="${pixelUrl}" width="1" height="1" alt="" style="display:none"></body></html>`, sendId);
  }
  const rawHtml = brandedHtml({
    text,
    extraFooter: `If you no longer wish to receive these messages, <a href="${unsubUrl}" style="color:#64748B">unsubscribe here</a>.`,
    pixel: `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">`,
  });

  return rewriteLinks(rawHtml, sendId);
}
