// Where a job actually is in the flow, beyond its stored status.
//
//   Quote  →  Scheduled  →  In progress  →  Completed  →  Invoiced  →  Paid  →  Certified
//
// Quote has levels of its own — a new enquiry isn't the same job as a quote
// the client said they'd come back to next week — and Certified is the end:
// paid and the certificate issued. Both are DERIVED here rather than stored as
// new statuses, so every report that reads `status` keeps working unchanged.
export {
  isCertified,
  jobStage,
  QUOTE_STAGES,
  quoteSentAt,
  quoteStage,
  liveStatus,
  noteSignals,
  quoteSentEvidence,
} from "./nextAction";
