// The kinds of office-wide push, with the words shown in Settings. Each
// person can switch any of them off for themselves (stored on their account
// as user_metadata.push_off = ["payments", …]); `urgent` kinds ignore quiet
// hours. Shared by the server sender and the settings screen.
export const PUSH_KINDS = [
  { key: "enquiry", label: "New enquiry — quote created", urgent: true },
  { key: "quote_accepted", label: "Client accepted a quote online" },
  { key: "reschedule", label: "Client asked to move an appointment" },
  { key: "engineer_confirmed", label: "Engineer confirmed a job from their link" },
  { key: "payments", label: "Payment reminders sent automatically" },
  { key: "renewals", label: "Renewal quotes ready to send" },
  { key: "paperwork", label: "Engineer paperwork expiring" },
];

// Overnight, UK time. Non-urgent pushes sent in this window are held and
// delivered together in the morning.
export const QUIET_FROM = 21; // 9pm
export const QUIET_UNTIL = 7; // 7am
