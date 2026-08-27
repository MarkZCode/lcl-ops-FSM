// Vapi (voice AI) helpers — server-side only. The API key never reaches the browser.
//   VAPI_API_KEY          = private/server API key
//   VAPI_ASSISTANT_ID     = the assistant configured with the renewal-pitch script
//   VAPI_PHONE_NUMBER_ID  = the outbound caller-ID number (Vapi/Twilio)
import { callerCard } from "./prospects";
import { site } from "./site";

const VAPI_API = "https://api.vapi.ai";

// Convert a UK-style number to E.164 for outbound dialing ("07426 409342" -> "+447426409342").
export function toE164(raw) {
  if (!raw) return "";
  let n = String(raw).replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n;
  if (n.startsWith("0")) return "+44" + n.slice(1);
  if (n.startsWith("44")) return "+" + n;
  return "+" + n;
}

// Build the assistant's prompt template variables.
// Accepts either a prospect (renewal customer) or a cold lead — falls back to
// safe empties when the renewal-specific fields aren't there.
export function buildCallVariables(record, upliftPct = 0) {
  const isCold = record?.type === "cold" || !!record?.segment;
  if (isCold) {
    return {
      name: (record.name || "").split(/\s+/)[0] || "there",
      fullname: record.name || "there",
      address: record.address || "",
      service: "",
      lastDone: "",
      dueDate: "",
      lastInvoice: "",
      suggested: "",
      company: site.name,
    };
  }
  const c = callerCard(record, upliftPct);
  return {
    name: c.name || "there",
    address: c.address || "",
    service: c.service || "",
    lastDone: c.lastDone || "",
    dueDate: c.dueDate || "",
    lastInvoice: c.lastInvoice || "",
    suggested: c.suggested || "",
    company: site.name,
  };
}

// Start an outbound call via the Vapi API. Returns { ok, callId } or { notConfigured: true }.
export async function startVapiCall({ phoneNumber, variables, metadata }) {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!apiKey || !assistantId || !phoneNumberId) {
    return { notConfigured: true };
  }

  const number = toE164(phoneNumber);
  if (!number) {
    return { error: "No phone number on this prospect." };
  }

  const res = await fetch(`${VAPI_API}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: { number },
      assistantOverrides: { variableValues: variables },
      metadata,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.message || data?.error || "Vapi call failed.", details: data };
  }
  return { ok: true, callId: data?.id };
}
