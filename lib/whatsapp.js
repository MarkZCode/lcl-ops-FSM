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

// What WhatsApp text should never contain: Markdown markers (they show as
// literal asterisks to the client) and "GST" for a Gas Safety Certificate —
// it's GSC.
export function cleanWhatsAppText(text) {
  return String(text || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s(])__([^_\n]+)__(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/\bGST\b/g, "GSC");
}

// Renewal and outreach messages are capped per day on each device. The
// business number has been restricted by WhatsApp before for sending too
// many of them; past the cap the app asks before opening another.
export const OUTREACH_WA_DAILY_CAP = 20;
export function outreachWhatsAppCount(bump = false) {
  if (typeof window === "undefined") return 0;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(localStorage.getItem("lcl-wa-outreach") || "{}");
    let n = saved.date === today ? saved.count || 0 : 0;
    if (bump) { n += 1; localStorage.setItem("lcl-wa-outreach", JSON.stringify({ date: today, count: n })); }
    return n;
  } catch { return 0; }
}
// Call from the click on an outreach WhatsApp button. Returns false when the
// user decided not to send another one today.
export function allowOutreachWhatsApp() {
  const n = outreachWhatsAppCount();
  if (n >= OUTREACH_WA_DAILY_CAP && !window.confirm(`${n} outreach WhatsApp messages have gone from this device today. WhatsApp has restricted the number before for this — send another anyway?`)) return false;
  outreachWhatsAppCount(true);
  return true;
}

// Build a click-to-send WhatsApp link. Uses the `whatsapp://` URI scheme so
// the desktop / WhatsApp Business app opens directly when installed (Mac,
// Windows, iOS, Android). Pass { web: true } to get the wa.me browser link
// instead (extra "Continue to chat" step) — kept as a manual fallback.
export function waLink(phone, message = "", { web = false } = {}) {
  message = cleanWhatsAppText(message);
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

// Open this number's WhatsApp chat in whatever the person at this device
// actually uses. A phone opens the WhatsApp (or WhatsApp Business) app; a
// computer opens WhatsApp Web or the desktop app, whichever they last chose
// in the Send message popup (`lcl-wa-pref`, WhatsApp Web by default — it
// also opens in the installed WhatsApp web app). Call from a click handler:
// browsers only allow a new tab while the click is still "live".
export function openWhatsAppChat(phone, message = "") {
  const num = toWhatsAppNumber(phone);
  if (!num || typeof window === "undefined") return false;
  const text = message ? encodeURIComponent(cleanWhatsAppText(message)) : "";
  const isPhone = /iphone|ipad|android|mobile/i.test(navigator.userAgent);
  let pref = "web";
  try { pref = localStorage.getItem("lcl-wa-pref") || "web"; } catch {}
  if (isPhone) {
    window.open(`https://wa.me/${num}${text ? `?text=${text}` : ""}`, "_blank", "noopener");
  } else if (pref === "app") {
    window.location.href = `whatsapp://send?phone=${num}${text ? `&text=${text}` : ""}`;
  } else {
    // Via /wa.html, not straight to web.whatsapp.com: with WhatsApp Web
    // installed as its own window, a direct link only brought that window
    // to the front without opening the chat (see public/wa.html).
    window.open(`/wa.html#p=${num}${text ? `&t=${text}` : ""}`, "_blank", "noopener");
  }
  // On the clipboard too, so the number can be pasted into WhatsApp's
  // search if the chat still doesn't open by itself.
  try { navigator.clipboard?.writeText(`+${num}`); } catch {}
  return true;
}
