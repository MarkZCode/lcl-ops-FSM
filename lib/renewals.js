import { addMonths } from "date-fns";
import { toDate, getJobLines } from "./format";
import { RENEWAL_MONTHS } from "./constants";

// Work out a job's certificate expiry = the soonest-expiring cert on it, based
// on each cert's validity period. Returns an ISO string or null.
export function computeCertExpiry(job) {
  const base = toDate(job.scheduledAt) || toDate(job.completedAt) || new Date();
  const expiries = getJobLines(job)
    .filter((l) => RENEWAL_MONTHS[l.code])
    .map((l) => addMonths(base, RENEWAL_MONTHS[l.code]).getTime());
  if (!expiries.length) return null;
  return new Date(Math.min(...expiries)).toISOString();
}

// Derive upcoming/overdue certificate renewals from jobs that have a certExpiry.
export function getRenewals(jobs, withinDays = 60) {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + withinDays);

  return jobs
    .filter((j) => j.certExpiry)
    .map((j) => {
      const expiry = toDate(j.certExpiry);
      const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      return { job: j, expiry, days };
    })
    .filter((r) => r.expiry <= horizon)
    .sort((a, b) => a.days - b.days);
}

export function renewalTone(days) {
  if (days < 0) return { label: "Overdue", color: "bg-rose-100 text-rose-700" };
  if (days <= 14) return { label: `${days}d left`, color: "bg-amber-100 text-amber-700" };
  return { label: `${days}d left`, color: "bg-navy-100 text-navy-600" };
}

// Build a renewal reminder email for a client.
export function buildRenewalEmail({ clientName, serviceName, expiryStr, phone = "07426 409342" }) {
  return {
    subject: `Reminder: your ${serviceName} certificate is expiring soon`,
    body: `Hi ${clientName},\n\nThis is a friendly reminder that your ${serviceName} certificate is due to expire on ${expiryStr}.\n\nTo stay fully compliant, we recommend rebooking 4–6 weeks before expiry. Simply reply to this email or call ${phone} and we'll arrange a convenient time.\n\nKind regards,\nLisa\nLandlord Compliance London\n07426 409342`,
  };
}
