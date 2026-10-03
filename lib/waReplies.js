// The saved WhatsApp replies, as text with {tags}. The wording here is the
// default; Settings → Saved replies can replace any of it, and the tags are
// filled from the job when the reply is used.
//
// Tags: {greeting} {first} {sender} {services} {property} {price} {when}
//       {ref} {account_holder} {sort_code} {account_number}
export const WA_REPLIES = [
  { key: "received", label: "New enquiry — received", text: "{greeting} {first}, {sender} here from Landlord Compliance London. Thank you for your enquiry regarding the {services}.\n\nWe'd be happy to arrange this for you and will come back to you with the quote shortly." },
  { key: "quote", label: "Quote", template: "quote", text: "Hi {first}, {sender} here from Landlord Compliance London.\n\nWe've prepared your quote for the {services}.\n\nJob: {ref}\nProperty: {property}\n\nThe quote has been sent to your email. To arrange the booking, please confirm:\n• Full property address\n• Certificate name\n• Tenant/access contact and number\n• Preferred date/time\n\nOnce confirmed, we can proceed with the booking." },
  { key: "availability", label: "Ask for a preferred slot", text: "{greeting} {first}, {sender} here from Landlord Compliance London. For the {services}, which day would suit you, and would you prefer a morning (8am–1pm) or an afternoon (1pm–6pm) appointment? We'll confirm the slot once the engineer has accepted it." },
  { key: "confirm", label: "Booking confirmed", needsConfirmed: true, text: "{greeting} {first}, {sender} here from Landlord Compliance London. Your {services} is confirmed for {when} at {property}. Job reference: {ref}. Please make sure someone is available to give access." },
  { key: "access", label: "Who gives access?", text: "{greeting} {first}, {sender} here from Landlord Compliance London. For your appointment {when}, could you confirm who will let the engineer in, and the best number to reach them on the day?" },
  { key: "payment", label: "Payment follow-up", text: "{greeting} {first}, just a quick follow-up regarding the invoice sent for the {services}. Kindly check the invoice and arrange payment using the bank details shown, with {ref} as the payment reference. Once payment is received, we can proceed with the certificate." },
  { key: "bank", label: "Bank details", text: "{greeting} {first}, {sender} here from Landlord Compliance London. The total is {price}. Bank transfer details — Account holder: {account_holder}, Sort code: {sort_code}, Account number: {account_number}, Reference: {ref}. Thank you." },
  { key: "cert", label: "Certificate completed", text: "Hi {first}, your {services} has now been completed and the document has been emailed to you. Thank you for your cooperation." },
  { key: "delay", label: "Delay update", text: "Hi {first}, just an update regarding your {services}. There has been a delay due to [reason]. The latest confirmed option is [confirmed option]. We apologise for the inconvenience and will keep you updated." },
  // Owner rule: never a price in WhatsApp — the figure is in the emailed quote.
  { key: "corrected", label: "Corrected quote", text: "{greeting} {first}, {sender} here from Landlord Compliance London. We've updated your quote for the {services} — the corrected version has been sent to your email. Please use that one, and apologies for any confusion." },
  { key: "followup", label: "Gentle quote follow-up", text: "{greeting} {first}, {sender} here from Landlord Compliance London. Just checking you received the quote for the {services}. Happy to answer any questions — and once you're ready, we just need the property address, the name for the certificate and who will give access." },
  { key: "tomorrow", label: "Reminder — visit tomorrow", needsConfirmed: true, text: "{greeting} {first}, a reminder from Landlord Compliance London that your {services} is booked for {when} at {property}. Please make sure the engineer can get in. Reference: {ref}." },
  { key: "noaccess", label: "No access — rebook", text: "{greeting} {first}, {sender} here from Landlord Compliance London. Our engineer attended today for the {services} but wasn't able to get access. Could you let us know a new day that suits, and who will be there to let them in?" },
  { key: "paid", label: "Payment received — thank you", text: "{greeting} {first}, thank you — we've received your payment for {ref}. Your certificate will follow by email shortly." },
  { key: "renewal", label: "Certificate renewal due", text: "{greeting} {first}, {sender} here from Landlord Compliance London. Our records show the {services} at {property} is coming up for renewal. Would you like us to book it in? Just reply here and we'll arrange it." },
  { key: "review", label: "Ask for a review", text: "{greeting} {first}, {sender} here from Landlord Compliance London. Thank you for using us for your {services}. If you were happy with the service, a quick Google review would mean a great deal to a small team like ours. Thank you!" },
];

export const REPLY_TAGS = ["greeting", "first", "sender", "services", "property", "price", "when", "ref", "account_holder", "sort_code", "account_number"];

// The reply as it will be sent: the saved wording if there is one, else the
// default, with the tags filled in. A tag with nothing to put in it is
// removed along with a dangling " at " before it.
export function fillReply(key, vars, overrides = {}) {
  const base = WA_REPLIES.find((r) => r.key === key);
  if (!base) return "";
  const tpl = (overrides && typeof overrides[key] === "string" && overrides[key].trim()) || base.text;
  return tpl
    .replace(/ at \{property\}/g, vars.property ? ` at ${vars.property}` : "")
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== "" ? String(vars[k]) : REPLY_TAGS.includes(k) ? "" : m))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
