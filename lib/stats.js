import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
  parseISO,
  format,
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
} from "date-fns";
import { SERVICE_CATALOG, DEFAULT_GAS_BASE_RATE, DEFAULT_GAS_EXTRA_RATE } from "./constants";
import { getJobLines, lineTotal, isAddonCode } from "./format";
import { engineerPayout, parkingReconcile, parkingSummary, hasPayConfig, rateForLine, payOverrideFor } from "./finance";
import { lineEngineerId, visitScopeForEngineer, certifierLegs } from "./visits";

// A "period" describes the time window we're reporting on.
// `custom` is only read for kind === "custom": { start: Date, end: Date }.
export function getPeriodRange(kind, ref, custom) {
  const d = ref || new Date();
  switch (kind) {
    case "day":
      return { start: startOfDay(d), end: endOfDay(d), label: format(d, "EEE d MMM yyyy") };
    case "week":
      return {
        start: startOfWeek(d, { weekStartsOn: 1 }),
        end: endOfWeek(d, { weekStartsOn: 1 }),
        label: `Week of ${format(startOfWeek(d, { weekStartsOn: 1 }), "d MMM yyyy")}`,
      };
    case "month":
      return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMMM yyyy") };
    case "year":
      return { start: startOfYear(d), end: endOfYear(d), label: format(d, "yyyy") };
    case "custom": {
      const start = custom?.start ? startOfDay(custom.start) : startOfMonth(d);
      const end = custom?.end ? endOfDay(custom.end) : endOfMonth(d);
      const sameYear = start.getFullYear() === end.getFullYear();
      const label = `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
      return { start, end, label };
    }
    default:
      return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMMM yyyy") };
  }
}

// Fixed "everything, ever" window — used where a figure (like engineer pay
// owed) must never hide something just because it falls outside whatever
// period the user happens to be viewing.
export const ALL_TIME_RANGE = { start: new Date(2000, 0, 1), end: new Date(2100, 0, 1), label: "All time" };

export function shiftRef(kind, ref, dir) {
  const d = ref || new Date();
  if (kind === "day") return addDays(d, dir);
  if (kind === "week") return addDays(d, dir * 7);
  if (kind === "month") return addMonths(d, dir);
  if (kind === "year") return addYears(d, dir);
  return addMonths(d, dir);
}

// Bucket a job into the period using scheduledAt, falling back to createdAt.
export function jobDate(job) {
  const raw = job.scheduledAt || job.createdAt;
  return raw ? parseISO(raw) : null;
}

const REVENUE_STATUSES = ["completed", "invoiced", "paid"];

// Quote-to-booking pipeline stats for the given period (all time if no range).
export function computePipeline(jobs) {
  const total = jobs.length;
  const quotes = jobs.filter((j) => j.status === "quote").length;
  const booked = jobs.filter((j) => !["quote", "cancelled"].includes(j.status)).length;
  const paid = jobs.filter((j) => j.status === "paid").length;
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 100) : 0;
  const closeRate = booked > 0 ? Math.round((paid / booked) * 100) : 0;

  // Average days from quote creation to scheduled status.
  const times = jobs
    .filter((j) => j.acceptedAt && j.createdAt)
    .map((j) => (new Date(j.acceptedAt) - new Date(j.createdAt)) / (1000 * 60 * 60 * 24));
  const avgDaysToBook = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;

  // Services breakdown: which service generates the most quotes/revenue.
  const svcMap = {};
  jobs.forEach((j) => {
    (j.services || []).forEach((code) => {
      if (!svcMap[code]) svcMap[code] = { count: 0, revenue: 0 };
      svcMap[code].count += 1;
      svcMap[code].revenue += (j.price || 0) / Math.max((j.services || []).length, 1);
    });
  });
  const topServices = Object.entries(svcMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([code, v]) => ({ code, ...v }));

  return { total, quotes, booked, paid, cancelled, conversionRate, closeRate, avgDaysToBook, topServices };
}

export function computeStats(jobs, range, engineers = [], engineerPayments = []) {
  const inRange = jobs.filter((j) => {
    const d = jobDate(j);
    return d && isWithinInterval(d, { start: range.start, end: range.end });
  });

  const revenue = inRange
    .filter((j) => REVENUE_STATUSES.includes(j.status))
    .reduce((sum, j) => sum + (j.price || 0), 0);

  const collected = inRange
    .filter((j) => j.status === "paid")
    .reduce((sum, j) => sum + (j.price || 0), 0);

  const outstanding = inRange
    .filter((j) => j.status === "invoiced")
    .reduce((sum, j) => sum + (j.price || 0), 0);

  const completed = inRange.filter((j) =>
    ["completed", "invoiced", "paid"].includes(j.status)
  ).length;

  // By status
  const byStatus = {};
  inRange.forEach((j) => {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  });

  // By service (count + revenue share)
  const byService = SERVICE_CATALOG.map((s) => {
    const matched = inRange.filter((j) => (j.services || []).includes(s.code));
    return {
      code: s.code,
      name: s.name,
      count: matched.length,
      revenue: matched.reduce((sum, j) => sum + (j.price || 0) / Math.max((j.services || []).length, 1), 0),
    };
  })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // By engineer (deduplicated)
  const engSeen = new Set();
  const byEngineer = (engineers || [])
    .filter((e) => {
      if (!e || !e.id || e.id === "unassigned" || engSeen.has(e.id)) return false;
      engSeen.add(e.id);
      return true;
    })
    .map((e) => {
      const matched = inRange.filter((j) => j.engineerId === e.id);
      return {
        id: e.id,
        name: e.name,
        color: e.color,
        count: matched.length,
        revenue: matched
          .filter((j) => REVENUE_STATUSES.includes(j.status))
          .reduce((sum, j) => sum + (j.price || 0), 0),
      };
    })
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  // Parking is collected on the day the engineer actually attends, so it
  // isn't tied to invoice/payment status the way revenue is — a completed
  // job that hasn't been invoiced yet still really collected parking that
  // day. But it DOES require a visit to have happened at all: excluding only
  // "cancelled" let a bare Quote with a £5 parking line count as money
  // already "collected from customers" when no engineer had ever attended —
  // three quotes carrying a parking line inflated this period's parking
  // total by £15 for visits that hadn't happened. REVENUE_STATUSES
  // (completed/invoiced/paid) is the same "did the visit actually occur"
  // gate revenue itself uses.
  const parking = parkingSummary(
    inRange.filter((j) => REVENUE_STATUSES.includes(j.status))
  );

  // Net profit = revenue minus ENGINEER COSTS ONLY (labour + VAT + parking
  // reimbursed).
  //
  // Bank transfer fees are deliberately NOT in here. They are the bank's
  // charge for moving money, not anything an engineer earns — folding them
  // into "engineer costs" overstated what the roster costs and made the
  // engineer-pay figures disagree with the payment records. They are a
  // company operating expense and are counted on the expenses side of the
  // P&L instead (see totalExpenses in app/reports/page.js), which leaves the
  // bottom line identical while putting the cost in the right bucket.
  const pay = computeEngineerPay(jobs, range, engineers, engineerPayments);

  // ONE BASIS. Revenue counts a job in the period its WORK falls in, so the
  // labour set against it has to be the labour for those same jobs.
  //
  // This used to be `revenue - totalOwed`, and totalOwed excludes any job a
  // payment has settled — so a month whose jobs had all been paid showed its
  // full revenue with ZERO labour cost. The cash line was worse: it subtracted
  // payments by the date the TRANSFER happened, so July's jobs paid on 25 Aug
  // took their cost out of August, against revenue earned in July. August then
  // read £514.97 revenue against £283.59 of July's labour, and both months'
  // profit were wrong in opposite directions.
  const netProfit = revenue - pay.totalAccrued;
  // Cash view: what actually left the bank in this window. Deliberately a
  // DIFFERENT question ("what did we bank"), and labelled as such wherever
  // it is shown — never mixed into the accrual figure above.
  const netProfitAfterPay = revenue - pay.totalPaid;
  const profitMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
  const profitMarginAfterPay = revenue > 0 ? Math.round((netProfitAfterPay / revenue) * 100) : 0;

  return {
    total: inRange.length,
    revenue,
    collected,
    outstanding,
    completed,
    avgValue: inRange.length ? revenue / Math.max(completed, 1) : 0,
    netProfit,
    netProfitAfterPay,
    profitMargin,
    profitMarginAfterPay,
    engineerCosts: pay.totalOwed,
    engineerCostsPaid: pay.totalPaid,
    engineerTransferFees: pay.totalTransferFees,
    engineerCashOut: pay.totalCashOut,
    engineerPayBalance: pay.totalBalance,
    byStatus,
    byService,
    byEngineer,
    parking,
  };
}

// Cashflow health for a period — the numbers an owner actually acts on:
// how much of billed work has turned into cash, how long that takes, and
// what's sitting overdue right now.
export function computeCashflow(jobs, range, now = new Date()) {
  const inRange = jobs.filter((j) => {
    const d = jobDate(j);
    return d && isWithinInterval(d, { start: range.start, end: range.end });
  });

  const billed = inRange.filter((j) => ["invoiced", "paid"].includes(j.status));
  const paid = billed.filter((j) => j.status === "paid");
  const billedValue = billed.reduce((s, j) => s + (j.price || 0), 0);
  const paidValue = paid.reduce((s, j) => s + (j.price || 0), 0);
  // % of invoiced work that has been collected.
  const collectionRate = billedValue > 0 ? Math.round((paidValue / billedValue) * 100) : null;

  // Average days from invoice to payment (jobs with both timestamps).
  const gaps = paid
    .filter((j) => j.invoicedAt && j.paidAt)
    .map((j) => (parseISO(j.paidAt) - parseISO(j.invoicedAt)) / 86400000)
    .filter((d) => d >= 0 && d < 365);
  const avgDaysToPay = gaps.length
    ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
    : null;

  // Overdue = invoiced 7+ days ago and still unpaid. Scanned across ALL jobs,
  // not just the period — an old unpaid invoice is a problem regardless of
  // which month the job was done in.
  const OVERDUE_MS = 7 * 86400000;
  const overdue = jobs.filter(
    (j) => j.status === "invoiced" && j.invoicedAt && now - parseISO(j.invoicedAt) > OVERDUE_MS
  );
  const overdueValue = overdue.reduce((s, j) => s + (j.price || 0), 0);

  return { collectionRate, avgDaysToPay, overdueCount: overdue.length, overdueValue };
}

// ---- Operating KPIs ------------------------------------------------------
// Metrics about how the BUSINESS is running, as opposed to what it billed.
// Deliberately all derived from data the FSM already captures — nothing here
// needs new manual input, which is the only reason a metric survives.
//
// Every value can be null, meaning "not enough data to answer honestly".
// A KPI that silently renders 0% when it actually means "no quotes yet" is
// worse than no KPI, so callers should show a dash for null.
export function computeOperatingKpis(jobs, range, engineers = [], clients = []) {
  const inRange = jobs.filter((j) => {
    const d = jobDate(j);
    return d && isWithinInterval(d, { start: range.start, end: range.end });
  });

  // ── Quote conversion — of quotes raised in this period, how many turned
  // into real work? Cancelled counts as a loss; still-open quotes are
  // excluded from the denominator so a fresh quote doesn't drag the rate down.
  const quotesRaised = inRange.filter((j) => j.quotedAt || j.status === "quote" || j.wasQuoted);
  const WON = ["scheduled", "in_progress", "completed", "invoiced", "paid"];
  const decided = inRange.filter((j) => WON.includes(j.status) || j.status === "cancelled");
  const won = decided.filter((j) => WON.includes(j.status));
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) : null;

  // ── Repeat business — share of this period's revenue-generating jobs that
  // came from a client who had already used us before this period started.
  const priorClientIds = new Set(
    jobs
      .filter((j) => {
        const d = jobDate(j);
        return d && d < range.start && REVENUE_STATUSES.includes(j.status);
      })
      .map((j) => j.clientId)
  );
  const earners = inRange.filter((j) => REVENUE_STATUSES.includes(j.status));
  const repeatJobs = earners.filter((j) => priorClientIds.has(j.clientId));
  const repeatRate = earners.length ? Math.round((repeatJobs.length / earners.length) * 100) : null;

  // ── Revenue per active engineer — output per head, the number that says
  // whether adding another engineer is warranted. "Active" = actually worked
  // in this period, not merely on the roster.
  const activeEngineerIds = new Set(
    earners.map((j) => j.engineerId).filter((id) => id && id !== "unassigned")
  );
  const revenue = earners.reduce((s, j) => s + (Number(j.price) || 0), 0);
  const revenuePerEngineer = activeEngineerIds.size
    ? revenue / activeEngineerIds.size
    : null;

  // ── Speed to cash — booking through to money in the bank. Distinct from
  // avgDaysToPay (invoice → paid); this covers the whole cycle, which is
  // where scheduling and admin delays actually show up.
  const cycles = earners
    .filter((j) => j.paidAt && (j.scheduledAt || j.createdAt))
    .map((j) => (parseISO(j.paidAt) - parseISO(j.scheduledAt || j.createdAt)) / 86400000)
    .filter((d) => d >= 0 && d < 365);
  const avgDaysBookedToPaid = cycles.length
    ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10
    : null;

  // ── Certificates issued — the actual unit of work delivered. A job can
  // carry several, so job count alone understates throughput.
  const certs = earners.reduce(
    (s, j) => s + getJobLines(j).filter((l) => !isAddonCode(l.code)).length,
    0
  );

  return {
    winRate,
    quotesDecided: decided.length,
    quotesOpen: quotesRaised.filter((j) => j.status === "quote").length,
    repeatRate,
    repeatJobs: repeatJobs.length,
    revenuePerEngineer,
    activeEngineers: activeEngineerIds.size,
    avgDaysBookedToPaid,
    certs,
  };
}

// Percentage change between a current and previous value, formatted for the
// StatCard trend badge. Returns null when there's nothing to compare.
export function trendVs(current, previous) {
  if (previous == null || current == null) return null;
  if (previous === 0) return current > 0 ? { direction: "up", value: "new" } : null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return null;
  return { direction: pct < 0 ? "down" : "up", value: `${Math.abs(pct)}%` };
}

function jobBreakdownForEngineer(job, engineer) {
  // Who owns a line is decided in ONE place (lib/visits) — its own override,
  // else the visit covering it, else the job. Reading only
  // `l.engineerId || job.engineerId` here missed every split job: the visit
  // knew Rizwan was doing the EPC, so his statement showed nothing and the
  // job's nominal engineer was credited with work they never did.
  const lines = getJobLines(job).filter((l) => lineEngineerId(job, l) === engineer.id);
  if (!lines.length) return null;

  // Parking/congestion are reimbursed against a receipt, never commissioned —
  // they're handled by parkingReconcile below and stay out of the pay base.
  const payableLines = lines.filter((l) => !isAddonCode(l.code));
  const revenue = payableLines.reduce((s, l) => s + lineTotal(l), 0);
  const cut = engineer.cutPercent != null ? Number(engineer.cutPercent) || 0 : 40;
  const vatRegistered = !!engineer.vatRegistered;
  const payType = engineer.payType || "per_job";
  const gasBaseRate = engineer.gasBaseRate != null ? Number(engineer.gasBaseRate) : DEFAULT_GAS_BASE_RATE;
  const gasExtraRate = engineer.gasExtraRate != null ? Number(engineer.gasExtraRate) : DEFAULT_GAS_EXTRA_RATE;
  // Delegate the actual pay maths to engineerPayout() — the single formula
  // also used by the job detail "Financials" card — instead of re-deriving
  // it here. This used to be a SEPARATE, duplicated implementation that
  // quietly drifted from the canonical one: it multiplied a fixed_service
  // GAS line by a flat rate × quantity (e.g. £24 × 2 = £48) instead of the
  // intended base-plus-extra formula (base £24 + extra £4 = £28 for 2
  // appliances), silently overpaying every multi-appliance gas job. Any
  // future pay-rule change now only has one place to go wrong, not two.
  let labour, vat;
  if (!hasPayConfig(engineer)) {
    // Never invent a fee for an engineer nobody has priced. The old 40%
    // fallback put a made-up number straight onto their statement, which is
    // worse than showing nothing — see hasPayConfig() in lib/finance.
    labour = 0;
    vat = 0;
  } else if (payType === "weekly") {
    // Weekly-retainer engineers aren't paid per job — their pay is totalled
    // separately (see computeEngineerPay below). No per-job labour/VAT.
    labour = 0;
    vat = 0;
  } else {
    const gasLine = lines.find((l) => l.code === "GAS");
    const applianceCountForPay = gasLine ? Math.max(1, Math.round(Number(gasLine.qty) || 1)) : (job?.gasAppliances || 1);
    // Did this engineer do the whole job, or only the inspection with someone
    // else issuing the certificate? Recorded on the VISIT that covers their
    // lines (scope: "inspection"), so a job can be inspected by one person and
    // certified by another and each is paid their own rate.
    const scope = visitScopeForEngineer(job, engineer.id);
    const payout = engineerPayout({
      jobValue: revenue,
      cutPercent: cut,
      vatRegistered,
      payType,
      gasBaseRate,
      gasExtraRate,
      applianceCount: applianceCountForPay,
      serviceRates: engineer.serviceRates || {},
      inspectionRates: engineer.inspectionRates || {},
      scope,
      jobLines: payableLines,
      overrideNet: payOverrideFor(job, engineer.id),
    });
    labour = payout.net;
    vat = payout.vat;
  }
  const parking = job.engineerId === engineer.id ? parkingReconcile(job) : { charged: 0, receiptSubmitted: false, receiptAmount: 0, reimbursed: 0, retained: 0 };
  const parkingReimbursed = parking.reimbursed;
  const owed = labour + vat + parkingReimbursed;
  // Whether this job has been PAID is decided in computeEngineerPay from the
  // payment records that name it, not here — a job is settled when money was
  // actually recorded against it, full stop.
  //
  // The old `job.engineerPaid` flag ("Mark settled") was a second, parallel
  // way of saying the same thing, and the two disagreed constantly: flagging
  // a job removed it from `owed` without creating a payment, so accrued
  // engineer cost collapsed to £0.00 while real payments still counted. One
  // mechanism now, not two.
  const settled = false;
  const overridden = payOverrideFor(job, engineer.id) != null;

  // Plain-English description of how this job's fee was worked out — used on
  // the engineer's payment statement (never mentions the customer price).
  let description;
  let applianceCount = null;
  if (overridden) {
    description = "Manual amount";
  } else if (payType === "fixed_gas") {
    const gasLine = getJobLines(job).find((l) => l.code === "GAS");
    applianceCount = gasLine ? Math.max(1, Math.round(Number(gasLine.qty) || 1)) : (job?.gasAppliances || 1);
    description = `Gas Safety · ${applianceCount} appliance${applianceCount === 1 ? "" : "s"}`;
  } else if (payType === "fixed_service") {
    description = lines
      .filter((l) => !l.waived && !l.addon && !["PARKING", "CONGESTION"].includes(l.code))
      .map((l) => l.tier ? `${l.code} · ${l.tier}` : l.code)
      .join(", ") || "Fixed rate";
  } else if (payType === "weekly") {
    description = "Weekly retainer";
  } else {
    description = `${cut}% of job`;
  }

  const serviceBreakdown = lines
    .filter((l) => !l.waived && !l.addon && !["PARKING", "CONGESTION"].includes(l.code))
    .map((l) => {
      const qty = Math.max(1, Math.round(Number(l.qty) || 1));
      const lineRevenue = lineTotal(l);
      // What this service is worth at the engineer's OWN rates — computed
      // even when a manual override is in force.
      //
      // This used to divide the override evenly across the lines, which
      // invented a per-service figure matching nobody's rate card: a £24
      // override on a job carrying a £54.99 FRA and a £60 EICR rendered as
      // "Engineer Pay: £12.00" against each, reported as the rates being
      // wrong. An override replaces the job TOTAL; it says nothing about
      // what each service is worth. So the real rates are shown here and the
      // override is stated once, as the total it actually is.
      let linePay = 0;
      if (payType === "fixed_gas" || payType === "fixed_service") {
        if (l.code === "GAS") {
          const base = Number(
            engineer.serviceRates?.GAS != null && typeof engineer.serviceRates.GAS !== "object"
              ? engineer.serviceRates.GAS
              : gasBaseRate
          );
          linePay = base + (qty - 1) * gasExtraRate;
        } else {
          linePay = rateForLine(l, engineer.serviceRates, gasBaseRate, gasExtraRate) * qty;
        }
      } else if (payType === "per_job") {
        linePay = (lineRevenue * cut) / 100;
      }
      return {
        id: l.id,
        code: l.code,
        name: l.name || certLabel(l.code) || l.code,
        tier: l.tier || "",
        qty,
        lineRevenue,
        linePay,
      };
    });

  return {
    jobId: job.id,
    date: jobDate(job),
    description,
    payType,
    applianceCount,
    revenue,
    labour,
    vat,
    cut,
    parkingReimbursed,
    parking,
    owed,
    settled,
    overridden,
    lines: serviceBreakdown,
  };
}

// Engineer pay for a period: counts the work each engineer did and multiplies
// by their pay rate + basis. Respects per-service engineer assignment
// (a line's engineer = its own engineerId, else the job's engineer).
export function computeEngineerPay(jobs, range, engineers = [], engineerPayments = []) {
  const done = jobs.filter((j) => {
    const d = jobDate(j);
    return (
      d &&
      isWithinInterval(d, { start: range.start, end: range.end }) &&
      REVENUE_STATUSES.includes(j.status)
    );
  });

  // Matched on paidAt (when the payment actually happened), not periodStart
  // (a snapshot of whatever date range happened to be on screen the moment
  // "Record payment" was clicked). periodStart matching meant a payment
  // silently stopped counting the instant the viewed range shifted even
  // slightly — the exact "recorded payment disappeared" symptom, on data
  // that was never actually lost. paidAt is stable — it never changes after
  // the fact, so which period a payment counts toward can't drift.
  // Every (engineer, job) pair that appears on ANY payment record — not just
  // this period's. A job paid last month must stay paid when you look at this
  // month, so this deliberately scans all payments regardless of date.
  //
  // Keyed by ENGINEER AND JOB, not job alone. A job routinely has two
  // engineers on it (gas by one, EICR by another), and keying on the job id
  // alone meant paying ONE of them marked the job settled for BOTH: the other
  // engineer's labour dropped straight out of "still owed" and their row read
  // £0.00 even though nobody had paid them a penny. Confirmed against live
  // data — Aaron was owed £28 on JOB-2388 and Kernel Harvey £24 on JOB-3916,
  // both showing as £0.00 because Saeed had been paid for those same jobs.
  const paidJobKeys = new Set();
  for (const p of engineerPayments || []) {
    for (const jid of p.jobIds || []) paidJobKeys.add(`${p.engineerId}::${jid}`);
  }
  const isSettledFor = (engineerId, jobId) => paidJobKeys.has(`${engineerId}::${jobId}`);

  const periodPayments = (engineerPayments || []).filter((p) => {
    try {
      const paidAt = parseISO(p.paidAt || p.periodStart);
      return paidAt >= range.start && paidAt <= range.end;
    } catch {
      return false;
    }
  });

  // Deduplicate engineers roster by ID/name to prevent duplicate rows in reports
  const uniqueEngineers = [];
  const seenIds = new Set();
  for (const e of engineers || []) {
    if (e && e.id && e.id !== "unassigned" && !seenIds.has(e.id)) {
      seenIds.add(e.id);
      uniqueEngineers.push(e);
    }
  }

  const rows = uniqueEngineers.map((e) => {
    const jobDetails = [];
    let certCount = 0;
    let revenue = 0;
    let parkingReimbursed = 0;
    let labour = 0;
    let vat = 0;
    let accrued = 0;

    done.forEach((job) => {
      // Certificate-only work: this engineer didn't attend, but signed off a
      // visit somebody else inspected. It's a real payable with no revenue,
      // no VAT and no parking attached to it, so it can't go through
      // jobBreakdownForEngineer (which keys off owning the service LINES).
      // Added as its own row so it shows on their statement and counts
      // towards what they're owed, exactly like attended work does.
      const myCertLegs = certifierLegs(job).filter((leg) => leg.certifierId === e.id);
      if (myCertLegs.length) {
        const fee = myCertLegs.reduce((sum, leg) => sum + leg.fee, 0);
        if (fee > 0) {
          const certRow = {
            jobId: job.id,
            date: job.scheduledAt || job.createdAt,
            description: `Certificate issued (inspection by another engineer)`,
            revenue: 0,
            labour: fee,
            vat: 0,
            parkingReimbursed: 0,
            owed: fee,
            certificateOnly: true,
            settled: isSettledFor(e.id, job.id),
          };
          jobDetails.push(certRow);
          accrued += fee;
          if (!certRow.settled) labour += fee;
        }
      }

      const row = jobBreakdownForEngineer(job, e);
      if (!row) return;
      row.inspectionOnly = visitScopeForEngineer(job, e.id) === "inspection";
      // A job is settled iff a payment record names it.
      row.settled = isSettledFor(e.id, row.jobId);
      jobDetails.push(row);
      certCount += getJobLines(job).filter((l) => lineEngineerId(job, l) === e.id).length;
      revenue += row.revenue;
      // What THIS PERIOD'S WORK COST, settled or not. Distinct from `labour`
      // below, which is only what is still owed. The P&L needs the cost of the
      // jobs it is counting revenue for — excluding settled ones made a month
      // whose jobs were all paid look like it had no labour cost at all.
      accrued += row.labour + row.vat + row.parkingReimbursed;
      // Settled jobs still show their true value in the per-job breakdown
      // (row.labour/vat above) but don't count toward what's still owed —
      // that's the whole point of marking one settled.
      if (!row.settled) {
        labour += row.labour;
        vat += row.vat;
        parkingReimbursed += row.parkingReimbursed;
      }
    });

    const cut = e.cutPercent != null ? Number(e.cutPercent) || 0 : 40;
    const vatRegistered = !!e.vatRegistered;
    const payType = e.payType || "per_job";
    const weeklyRate = Number(e.weeklyRate) || 0;

    let jobOwed = labour + vat + parkingReimbursed;
    if (payType === "weekly" && weeklyRate > 0) {
      // Weekly retainer replaces per-job labour; parking reimbursements still apply.
      jobOwed = weeklyRate + parkingReimbursed;
      labour = weeklyRate;
      vat = 0;
    }

    const owed = jobOwed;
    // A payment only belongs to THIS row if it actually names one of this
    // engineer's jobs FOR THIS PERIOD — filtering periodPayments by paidAt
    // alone let a payment for a job from a different period (paid late, or
    // early) inflate this period's "Paid"/"Cash out" for an engineer whose
    // "Jobs this period" list didn't even include that job. Confirmed on
    // live data: RIZWAN's August table row read £151.99 paid against 2 jobs
    // worth £101.99, because a payment for a July job (paid in August) was
    // being counted here — irrespective of when it was paid is exactly the
    // point: it belongs to July's stats, not August's.
    const periodJobIds = new Set(jobDetails.map((jd) => jd.jobId));
    const myPayments = periodPayments.filter(
      (p) => p.engineerId === e.id && (p.jobIds || []).some((id) => periodJobIds.has(id))
    );
    // `paid` counts ENGINEER EARNINGS only — never the bank's transfer fee.
    // Including the fee here would make a correctly-settled engineer look
    // overpaid by £0.74 per transfer and leave a permanent phantom credit.
    const paid = myPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Tracked separately: a real company cost that never touches the
    // engineer's ledger, but must land in the P&L.
    const transferFees = myPayments.reduce((s, p) => s + (Number(p.transferFee) || 0), 0);
    const cashOut = paid + transferFees;
    // What is STILL DUE = `owed`, full stop — nothing more to subtract.
    //
    // This used to be `Math.max(0, owed - paid)`, which subtracted the same
    // settlement twice. A job counts as settled the moment a payment names it
    // (isSettledFor), and a settled job is already excluded from `owed` by the
    // `if (!row.settled)` guard above. Every payment in `paid` names one of
    // those jobs, so taking `paid` off again removed money that had already
    // been taken off.
    //
    // It also hid unpaid work behind an unrelated overpayment. Reported on
    // Saeed: £130 recorded against £74 of settled jobs, so the £56 excess
    // cancelled out most of the £125 still owed for JOB-5359 and the row read
    // "Balance £0.00 — Fully settled" while that job sat plainly unpaid. Those
    // are two separate facts and netting them off hid both; the overpayment is
    // already called out on its own ("£56.00 more than the work").
    const balance = owed;

    // What actually determined the labour figure — must reflect payType,
    // not just always say "X%" (that was showing on fixed-rate engineers
    // too, implying they were paid a percentage when they weren't).
    const payLabel =
      payType === "fixed_service" ? "fixed rate"
      : payType === "fixed_gas" ? "fixed · per appliance"
      : payType === "weekly" ? "weekly retainer"
      : `${cut}%`;

    return {
      id: e.id,
      name: e.name,
      color: e.color,
      payType,
      payLabel,
      // Which of this engineer's rows are inspection-only, and which are
      // certificate-only, so the pay table can say WHY a figure is lower than
      // the full rate rather than leaving it looking like a mistake.
      inspectionJobs: jobDetails.filter((d) => d.inspectionOnly).length,
      certificateJobs: jobDetails.filter((d) => d.certificateOnly).length,
      weeklyRate,
      jobs: jobDetails.length,
      certs: certCount,
      revenue,
      cut,
      vatRegistered,
      labour,
      vat,
      parkingReimbursed,
      accrued,
      owed,
      paid,
      transferFees,
      cashOut,
      balance,
      jobDetails: jobDetails.sort((a, b) => a.jobId.localeCompare(b.jobId)),
      payments: periodPayments.filter((p) => p.engineerId === e.id),
    };
  });

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  // Cost of the work done in this period, whether or not it has been paid yet.
  // This is the figure the P&L must set against the period's revenue.
  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalLabour = rows.reduce((s, r) => s + r.labour, 0);
  const totalVat = rows.reduce((s, r) => s + r.vat, 0);
  const totalParking = rows.reduce((s, r) => s + r.parkingReimbursed, 0);
  // Bank fees on this period's transfers — company cost, not engineer pay.
  const totalTransferFees = rows.reduce((s, r) => s + r.transferFees, 0);
  // Actual cash that left the account: engineer earnings + the fees to move it.
  const totalCashOut = totalPaid + totalTransferFees;
  return {
    rows: rows.sort((a, b) => b.balance - a.balance || b.owed - a.owed),
    totalOwed,
    totalAccrued,
    totalPaid,
    totalTransferFees,
    totalCashOut,
    totalBalance,
    totalLabour,
    totalVat,
    totalParking,
    periodPayments,
  };
}

// Build a small time-series for the trend chart across the period.
export function buildSeries(jobs, kind, range) {
  let buckets = [];
  if (kind === "year") {
    buckets = eachMonthOfInterval({ start: range.start, end: range.end }).map((d) => ({
      label: format(d, "MMM"),
      start: startOfMonth(d),
      end: endOfMonth(d),
    }));
  } else if (kind === "month" || kind === "week") {
    buckets = eachDayOfInterval({ start: range.start, end: range.end }).map((d) => ({
      label: format(d, kind === "week" ? "EEE" : "d"),
      start: startOfDay(d),
      end: endOfDay(d),
    }));
  } else {
    // day -> single bucket
    buckets = [{ label: format(range.start, "d MMM"), start: range.start, end: range.end }];
  }

  return buckets.map((b) => {
    const matched = jobs.filter((j) => {
      const d = jobDate(j);
      return d && isWithinInterval(d, { start: b.start, end: b.end });
    });
    const revenue = matched
      .filter((j) => REVENUE_STATUSES.includes(j.status))
      .reduce((sum, j) => sum + (j.price || 0), 0);
    return { label: b.label, count: matched.length, revenue };
  });
}

// Is this job inside the given range? Exported so the Jobs list filters on
// exactly the same rule the Reports figures are built from — two different
// date rules would put the same job in different months on different pages.
export function jobInRange(job, range) {
  const d = jobDate(job);
  if (!d) return false;
  return d >= range.start && d <= range.end;
}

// Expenses that belong to a period, with recurring costs counted once per
// MONTH the period covers.
//
// The old rule was `if (e.recurring) return true` — include it in whatever is
// on screen, once. That is right for a single month and wrong everywhere else:
// a £5.80/month subscription counted £5.80 across a two-month range (should be
// £11.60) and £5.80 across a whole year (should be £69.60), so any range wider
// than a month silently understated costs and overstated profit. It also meant
// July + August never added up to Jul–Aug.
export function expensesForRange(expenses = [], range) {
  const oneTime = [];
  const recurring = [];
  for (const e of expenses) (e.recurring ? recurring : oneTime).push(e);

  const inWindow = oneTime.filter((e) => {
    try {
      const d = parseISO(e.date);
      return d >= range.start && d <= range.end;
    } catch {
      return false;
    }
  });

  // Whole calendar months touched by the range, minimum one — a range inside a
  // single month still carries that month's subscriptions.
  const months = Math.max(
    1,
    (range.end.getFullYear() - range.start.getFullYear()) * 12 +
      (range.end.getMonth() - range.start.getMonth()) + 1
  );

  const total =
    inWindow.reduce((s, e) => s + (Number(e.amount) || 0), 0) +
    recurring.reduce((s, e) => s + (Number(e.amount) || 0), 0) * months;

  return { items: [...inWindow, ...recurring], oneTime: inWindow, recurring, months, total };
}
