// WhatsApp helpers. Click-to-send now (wa.me); structured so an automatic
// Business API sender can be added later without changing callers.

// Convert a UK phone number to international wa.me format (no +, no spaces).
// "07426 409342"  -> "447426409342"
// "2082491900"    -> "442082491900"  (CSV parsed as a number, leading 0 dropped)
export function toWhatsAppNumber(raw) {
  if (!raw) return "";
  let n = String(raw).replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  // UK number with leading zero stripped by CSV/spreadsheet number formatting:
  // 10 digits not already starting with 44 → restore the 0 then convert.
  if (n.length === 10 && !n.startsWith("44")) n = "0" + n;
  if (n.startsWith("0")) n = "44" + n.slice(1); // UK local -> +44
  if (n.startsWith("44")) return n;
  // already international or unknown — return digits as-is
  return n;
}

// Build a click-to-send WhatsApp link. Uses the `whatsapp://` URI scheme so
// the desktop / WhatsApp Business app opens directly when installed (Mac,
// Windows, iOS, Android). Pass { web: true } to get the wa.me browser link
// instead (extra "Continue to chat" step) — kept as a manual fallback.
export function waLink(phone, message = "", { web = false } = {}) {
  const num = toWhatsAppNumber(phone);
  if (!num) return null;
  if (web === "wa.me") {
    return `https://wa.me/${num}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  }
  // Default to WhatsApp Web since the user uses the WhatsApp Web Chrome App for their business account
  return `https://web.whatsapp.com/send?phone=${num}${message ? `&text=${encodeURIComponent(message)}` : ""}`;
}

export function waWebLink(phone, message = "") {
  return waLink(phone, message, { web: true });
}

// Placeholder for the future automatic WhatsApp Business API send.
// Wire this to /api/send-whatsapp (Twilio / 360dialog) when the number is approved.
export async function sendWhatsAppAPI() {
  throw new Error(
    "Automatic WhatsApp sending requires the WhatsApp Business API (Meta verification + provider). Use the click-to-send button for now."
  );
}
