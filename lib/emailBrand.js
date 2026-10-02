// The look of every email a client receives: the logo and company name on
// top, the message in a clean white panel, and the company's contact details
// underneath. Built with tables and inline styles because that is what
// Outlook, Gmail and Apple Mail all render the same way.
//
// The words are exactly the plain-text message — nothing is added to or
// taken from what was written; this only dresses it.
import { invoiceConfig } from "./invoiceConfig";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://lcl-ops.vercel.app");
// Always the public address, so the logo loads from a preview deployment too.
const LOGO_URL = "https://lcl-ops.vercel.app/logo-mark.png";

const NAVY = "#14213D";
const GREEN = "#1F8A3B";
const MUTED = "#64748B";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const button = (url, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px 0"><tr><td bgcolor="${GREEN}" style="border-radius:8px"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table>`;

// Plain text → paragraphs. Links become links; the "accept your quote" line
// becomes a button; lines starting with a bullet keep their indent.
function bodyHtml(text) {
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (u) => `<a href="${u}" style="color:${GREEN};text-decoration:underline">${u}</a>`);
  return String(text || "")
    .split(/\n{2,}/)
    .map((para) => {
      const accept = para.match(/^You can view and accept your quote online here:\s*(https?:\/\/\S+)\s*$/i);
      if (accept) return button(accept[1], "View and accept your quote");
      return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#1F2937">${linkify(esc(para)).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

// `extraFooter` is optional small print (the unsubscribe line on outreach);
// `pixel` an optional tracking image tag.
export function brandedHtml({ text, extraFooter = "", pixel = "" }) {
  const c = invoiceConfig;
  const contact = [c.phone, c.email, c.website].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.company)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F4F8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F4F8">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td style="padding:0 4px 16px 4px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:12px"><img src="${LOGO_URL}" width="44" height="44" alt="" style="display:block;border:0;border-radius:10px;background:#ffffff"></td>
        <td style="font-family:${FONT}">
          <div style="font-size:17px;font-weight:700;color:${NAVY};line-height:1.2">${esc(c.company)}</div>
          <div style="font-size:12px;color:${MUTED};line-height:1.4">Your compliance, our priority</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;border-top:4px solid ${GREEN};padding:30px 32px 16px 32px">
${bodyHtml(text)}
    </td></tr>
    <tr><td style="padding:18px 8px 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}" align="center">
      <strong style="color:${NAVY}">${esc(c.company)}</strong><br>
      ${contact}<br>
      ${esc(c.address)}
      ${extraFooter ? `<br><br>${extraFooter}` : ""}
    </td></tr>
  </table>
</td></tr>
</table>
${pixel}
</body>
</html>`;
}

export { APP_URL };
