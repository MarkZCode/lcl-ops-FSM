// The numbers the business runs on, in one place.
//
// Deadlines, thresholds and fees used to be constants scattered through the
// code — £250 here, fifteen minutes there — so changing one meant a code
// change. They are settings now (Settings → Rules), stored in their own
// row, read by the screens and by the server's task engine alike.
// Anything missing from the saved copy falls back to the default below.
export const DEFAULT_RULES = {
  // Tasks
  highValue: 250,            // a job worth this much is always urgent
  officeOpens: 8,            // task clocks run between these hours, UK time
  officeCloses: 19,
  sla: {                     // minutes of office time before a task is late
    check_quote: 15,
    wa_reply: 15,
    send_quote_urgent: 30,
    reply: 60,
    quote: 480,
    book: 240,
    confirm: 240,
    close: 240,
    tell_client: 240,
    invoice: 480,
    payment: 1440,
    certificate: 480,
  },
  // Money
  noAccessFee: 20,           // default when a job carries the no-access condition
  remedialMargin: 30,        // % added to the engineer's cost on remedial work
  weeklyTarget: 0,           // revenue aimed for each week (0 = no target shown)
  // Capacity and limits
  engineerDailyJobs: 5,      // more than this in a day is flagged on dispatch
  outreachWaCap: 20,         // outreach WhatsApps per device per day before a warning
  // The line that asks the client to reply soon. Added to the quote email
  // and to the WhatsApp message that goes with it.
  urgencyLine: "Our diary for this week is filling up quickly, so if you'd like to go ahead, just reply today and I'll hold the earliest available slot for you.",
  emailDailyCap: 0,          // most emails a day from any one mailbox (0 = the provider's own limit)
  holidays: [],              // dates (YYYY-MM-DD) the office is closed: task clocks don't run
  replyOverrides: {},        // saved WhatsApp reply wording, by reply key (lib/waReplies.js)
};

export const SLA_LABELS = {
  check_quote: "Check a new quote",
  wa_reply: "First reply to an enquiry",
  send_quote_urgent: "Send the quote",
  reply: "Reply to a client",
  quote: "Chase or follow up a quote",
  book: "Assign an engineer / book a date",
  confirm: "Get the engineer to confirm",
  close: "Mark finished work done",
  tell_client: "Tell the client (booking, access, reminder)",
  invoice: "Send the invoice",
  payment: "Chase a payment",
  certificate: "Certificate (chase, check, send)",
};

export function withDefaults(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  return {
    ...DEFAULT_RULES, ...s,
    sla: { ...DEFAULT_RULES.sla, ...(s.sla || {}) },
    holidays: Array.isArray(s.holidays) ? s.holidays : [],
    replyOverrides: s.replyOverrides && typeof s.replyOverrides === "object" ? s.replyOverrides : {},
  };
}
