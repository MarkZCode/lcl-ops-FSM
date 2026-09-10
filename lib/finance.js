// Central money maths for engineer payouts and parking reconciliation.
// Keeping this in one place guarantees the job card, reports and engineer
// statements all agree to the penny.
import { VAT_RATE, DEFAULT_PARKING_CHARGE, DEFAULT_CONGESTION_CHARGE, DEFAULT_GAS_BASE_RATE, DEFAULT_GAS_EXTRA_RATE, DEFAULT_SERVICE_RATES, DEFAULT_TRANSFER_FEE } from "./constants";
import { getJobLines, lineTotal, isAddonCode } from "./format";
import { lineEngineerId } from "./visits";

// The customer-facing EICR tier "1–3 Bedrooms" is one price band for
// quoting, but some engineers (currently: Prime Electric, per their agreed
// rate card) are paid a genuinely different amount per exact bedroom count
// within that band. Rather than split the customer-facing tier itself —
// which would change what every client sees quoted, for every engineer —
// the job line optionally carries its own `bedroomCount` (set on the line
// in JobModal.js, independent of the quoting tier), and an engineer's
// serviceRates can carry these finer keys alongside their normal tier keys.
// Engineers with no such keys configured are entirely unaffected: the
// lookup below falls straight through to the existing tier-based rate.
function bedroomRateKey(n) {
  const count = Number(n);
  return count === 1 ? "1 Bedroom" : `${count} Bedrooms`;
}

// Resolve what a service line is worth to the engineer.
//
// serviceRates[code] can be EITHER:
//   - a flat number, e.g. `{ EICR: 50 }`                          (legacy — one rate for any size)
//   - a per-tier map, e.g. `{ EICR: { "Studio": 20, "4 Bedrooms": 35 } }`
//     keyed by the SAME tier label the job line carries (SERVICE_CATALOG[code].tiers[].label,
//     set when the operator picks a property size in the job form — see JobModal.js),
//     optionally ALSO keyed by exact bedroom count ("1 Bedroom", "2 Bedrooms", "3 Bedrooms")
//     for engineers paid at that finer grain — see bedroomRateKey above.
// This is how "manually enter what we pay per service, per property size"
// works — every engineer can have entirely different tier rates for the
// same service, because pay is genuinely not a fixed % or flat fee across
// the roster (some companies get more, some individuals get less).
// Falls back, in order: exact-bedroom rate (if the line specifies one and
// the engineer has it configured) → tier-specific rate → engineer's own
// flat rate for that service → house default (DEFAULT_SERVICE_RATES) — so
// a service with no rate configured yet never silently pays £0.
export function rateForLine(line, serviceRates, gasBaseRate, gasExtraRate) {
  const entry = serviceRates?.[line.code];
  if (entry && typeof entry === "object") {
    if (line.bedroomCount) {
      const key = bedroomRateKey(line.bedroomCount);
      if (entry[key] != null) return Number(entry[key]);
    }
    if (entry[line.tier] != null) return Number(entry[line.tier]);
    // No tier match (job has a tier the engineer's rate table doesn't cover
    // yet, or the line has no tier at all) — fall back to a flat default if
    // one was set, else the house default.
    if (entry.flat != null) return Number(entry.flat);
  } else if (entry != null) {
    return Number(entry); // legacy flat-number shape
  }
  return DEFAULT_SERVICE_RATES[line.code] || 40;
}

// The INSPECTION-ONLY rate for a line — what an engineer is paid when they
// attend and carry out the inspection but do NOT issue the certificate
// (someone else signs it off).
//
// Same shape and same fallback chain as rateForLine, read from the engineer's
// `inspectionRates` table instead of `serviceRates`. Deliberately returns null
// rather than a house default when nothing is set: there is no sensible
// industry default for "inspection minus the certificate", and silently
// inventing one would underpay or overpay someone on every job. Callers treat
// null as "not configured" and fall back to the full rate, which at least errs
// towards paying the engineer what they'd normally get.
export function inspectionRateForLine(line, inspectionRates) {
  const entry = inspectionRates?.[line?.code];
  if (entry && typeof entry === "object") {
    if (line?.bedroomCount) {
      const key = bedroomRateKey(line.bedroomCount);
      if (entry[key] != null) return Number(entry[key]);
    }
    if (entry[line?.tier] != null) return Number(entry[line.tier]);
    if (entry.flat != null) return Number(entry.flat);
    return null;
  }
  if (entry != null && entry !== "") return Number(entry);
  return null;
}

// What the CERTIFICATE alone is worth for this engineer on this line: the
// full-job rate less the inspection-only rate. Used to seed the certifier's
// fee when a job is split between an inspector and a certifier, so the two
// halves add up to what one engineer doing the whole thing would have cost.
// Always overridable on the visit — it's a starting figure, not a rule.
export function certificationRateForLine(line, engineer) {
  const full = rateForLine(line, engineer?.serviceRates, engineer?.gasBaseRate, engineer?.gasExtraRate);
  const insp = inspectionRateForLine(line, engineer?.inspectionRates);
  if (insp == null) return null;
  return Math.max(0, round2(full - insp));
}

// Has this engineer actually got a rate on file for this service?
//
// rateForLine() deliberately falls back to a house default so nothing ever
// pays £0 by accident — but a fallback that nobody can SEE is how a job ends
// up quoting a number no one agreed to. This reports the fallback so the UI
// can say "no EPC rate set for Rizwan — using the £45 default" out loud.
export function hasRateForLine(line, serviceRates) {
  const entry = serviceRates?.[line?.code];
  if (entry && typeof entry === "object") {
    if (line?.bedroomCount && entry[bedroomRateKey(line.bedroomCount)] != null) return true;
    return entry[line?.tier] != null || entry.flat != null;
  }
  return entry != null;
}

// An engineer nobody has priced yet: no pay type, no percentage, no service
// rates, no retainer. There is no honest figure to show for them — inventing
// a 40% cut for a job they might be doing at fixed rates is a made-up number
// that then flows into margin, reports and payouts.
export function hasPayConfig(engineer) {
  if (!engineer || engineer.id === "unassigned") return false;
  if (engineer.payType) return true;
  if (engineer.cutPercent != null) return true;
  if (engineer.weeklyRate != null && engineer.weeklyRate !== "") return true;
  return Object.keys(engineer.serviceRates || {}).length > 0;
}

// ---- Engineer payout (with optional VAT on the engineer's share) ----
// VAT is calculated on the engineer's NET fee only — never on the customer's
// full invoice. If the engineer is not VAT registered, payable === net.
//
// Pricing modes:
//  - per_job (default): net = jobValue * cutPercent / 100
//  - fixed_service / fixed_gas: net is a sum of FIXED fees per service line,
//    set per engineer in serviceRates (flat OR per-size-tier — see
//    rateForLine above), completely independent of what the customer was
//    charged. This is the "manually enter what we pay, per service, per
//    property size" mode.
//  - weekly: the engineer is paid a flat retainer per week, not per job — so
//    a single job has no individual labour/VAT share (net = 0). Parking
//    reimbursements still apply per job. See computeEngineerPay() in
//    lib/stats.js for how the weekly retainer itself is totalled.
export function engineerPayout({
  jobValue = 0,
  cutPercent = 40,
  vatRegistered = false,
  payType = "per_job",
  gasBaseRate = DEFAULT_GAS_BASE_RATE,
  gasExtraRate = DEFAULT_GAS_EXTRA_RATE,
  applianceCount = 1,
  serviceRates = {},
  // Inspection-only work: this engineer attended and inspected, but somebody
  // else issued the certificate. Pays from inspectionRates instead of
  // serviceRates. Falls back to the full rate when no inspection rate is on
  // file, so an unconfigured engineer is never silently underpaid.
  inspectionRates = {},
  scope = "full", // "full" | "inspection"
  jobLines = [],
  // Exceptional-case manual figure — e.g. a reinspection where the engineer
  // is deliberately paid less than the normal formula would give. Set on
  // the job itself (job.engineerPayOverride), takes over completely instead
  // of any payType calculation. VAT (if the engineer is registered) still
  // applies on top, same as every other pay mode.
  overrideNet,
}) {
  if (overrideNet != null && overrideNet !== "") {
    const net = Number(overrideNet) || 0;
    const vat = vatRegistered ? net * VAT_RATE : 0;
    return {
      net, vat, payable: net + vat, cutPercent: Number(cutPercent) || 0,
      vatRegistered: !!vatRegistered, payType, applianceCount,
      gasBaseRate: Number(gasBaseRate) || 0, gasExtraRate: Number(gasExtraRate) || 0,
      serviceRates: serviceRates || {}, overridden: true,
    };
  }
  let net = 0;
  if (payType === "fixed_gas" || payType === "fixed_service") {
    const validLines = (jobLines || []).filter((l) => !l.waived && !l.addon && !["PARKING", "CONGESTION"].includes(l.code));
    if (validLines.length > 0) {
      validLines.forEach((line) => {
        if (line.code === "GAS") {
          const qty = Math.max(1, Math.round(Number(line.qty) || Number(applianceCount) || 1));
          const base = Number(serviceRates?.GAS != null && typeof serviceRates.GAS !== "object"
            ? serviceRates.GAS
            : (gasBaseRate != null ? gasBaseRate : DEFAULT_GAS_BASE_RATE));
          const extra = Number(gasExtraRate != null ? gasExtraRate : DEFAULT_GAS_EXTRA_RATE);
          const gasFull = base + (qty - 1) * extra;
          const gasInsp = scope === "inspection"
            ? inspectionRateForLine(line, inspectionRates)
            : null;
          // A gas inspection rate is a flat per-visit figure, not per appliance
          // — the second appliance doesn't need a second certificate.
          net += gasInsp != null ? gasInsp : gasFull;
        } else {
          const qty = Math.max(1, Math.round(Number(line.qty) || 1));
          const full = rateForLine(line, serviceRates, gasBaseRate, gasExtraRate);
          const insp = scope === "inspection"
            ? inspectionRateForLine(line, inspectionRates)
            : null;
          net += (insp != null ? insp : full) * qty;
        }
      });
    } else if (!jobLines || jobLines.length === 0) {
      // TRUE legacy case — no lineItems array at all (a pre-lineItems job
      // that's implicitly one flat gas service). Safe to assume gas here.
      const n = Math.max(1, Math.round(Number(applianceCount) || 1));
      const base = Number(serviceRates?.GAS != null && typeof serviceRates.GAS !== "object"
        ? serviceRates.GAS
        : (gasBaseRate != null ? gasBaseRate : DEFAULT_GAS_BASE_RATE));
      const extra = Number(gasExtraRate != null ? gasExtraRate : DEFAULT_GAS_EXTRA_RATE);
      net = base + (n - 1) * extra;
    } else {
      // Real lineItems exist for this job, but every one of THIS engineer's
      // assigned lines is an addon (Parking/Congestion) — e.g. they're only
      // attached to the job as its nominal "assigned engineer" while a
      // DIFFERENT engineer is doing the actual certificate work on a
      // per-line override. There's no certificate service for them here, so
      // no labour fee — falling through to the gas-appliance formula above
      // invented a fee out of nothing (a flat "1 appliance" gas charge on a
      // job that had no gas line, or a different engineer's gas line).
      net = 0;
    }
  } else if (payType === "weekly") {
    net = 0;
  } else {
    net = (Number(jobValue) || 0) * (Number(cutPercent) || 0) / 100;
  }
  const vat = vatRegistered ? net * VAT_RATE : 0;
  const payable = net + vat;
  return {
    net,
    vat,
    payable,
    cutPercent: Number(cutPercent) || 0,
    vatRegistered: !!vatRegistered,
    payType,
    applianceCount,
    gasBaseRate: Number(gasBaseRate) || 0,
    gasExtraRate: Number(gasExtraRate) || 0,
    serviceRates: serviceRates || {},
    scope,
  };
}

// ---- Parking reconciliation for a single job ----
// charged   = what the customer was billed for parking (a PARKING line, or the
//             stored parkingAmountCharged override).
// reimbursed= what we pay the engineer back (only if a receipt was submitted;
//             capped at nothing — we honour the full receipt even if it exceeds
//             what we charged, absorbing the difference).
// retained  = company keeps (charged − reimbursed); negative = company absorbs.
export function parkingReconcile(job) {
  const lines = getJobLines(job || {});
  const parkingLine = lines.find((l) => l.code === "PARKING" && !l.waived);
  const lineCharge = parkingLine ? lineTotal(parkingLine) : 0;
  // If no parking line found via lineItems, fall back to services array
  // (handles jobs where lineItems exists but PARKING was added via services).
  const servicesFallback =
    lineCharge === 0 && (job?.services || []).includes("PARKING")
      ? DEFAULT_PARKING_CHARGE
      : 0;
  const charged =
    job?.parkingAmountCharged != null && job.parkingAmountCharged !== ""
      ? Number(job.parkingAmountCharged) || 0
      : lineCharge || servicesFallback;
  const receiptSubmitted = !!job?.parkingReceiptSubmitted;
  const receiptAmount = Number(job?.parkingReceiptAmount) || 0;
  const reimbursed = receiptSubmitted ? receiptAmount : 0;
  const retained = charged - reimbursed; // +ve company keeps, -ve company absorbs
  return { charged, receiptSubmitted, receiptAmount, reimbursed, retained };
}

// ---- Full per-job financial breakdown (used by the job card + reports) ----
export function jobFinancials(job, engineer) {
  const jobValue = Number(job?.price) || 0;
  const cutPercent = engineer?.cutPercent != null ? Number(engineer.cutPercent) : 40;
  const vatRegistered = !!engineer?.vatRegistered;
  const payType = engineer?.payType || "per_job";
  const gasBaseRate = engineer?.gasBaseRate != null ? Number(engineer.gasBaseRate) : DEFAULT_GAS_BASE_RATE;
  const gasExtraRate = engineer?.gasExtraRate != null ? Number(engineer.gasExtraRate) : DEFAULT_GAS_EXTRA_RATE;
  const serviceRates = engineer?.serviceRates || {};
  const jobLines = getJobLines(job || {});
  const gasLine = jobLines.find((l) => l.code === "GAS");
  const applianceCount = gasLine ? Math.max(1, Math.round(Number(gasLine.qty) || 1)) : (job?.gasAppliances || 1);
  const pay = engineerPayout({
    jobValue,
    cutPercent,
    vatRegistered,
    payType,
    gasBaseRate,
    gasExtraRate,
    applianceCount,
    serviceRates,
    jobLines,
    overrideNet: job?.engineerPayOverride,
  });
  const parking = parkingReconcile(job);
  // What the engineer takes home this job = labour payable + parking reimbursed.
  const engineerTotal = pay.payable + parking.reimbursed;
  // Company gross margin on this job = customer value − engineer labour payable
  // (incl. their VAT) − parking we reimburse.
  const companyMargin = jobValue - pay.payable - parking.reimbursed;
  return {
    jobValue,
    ...pay, // net, vat, payable, cutPercent, vatRegistered
    parking,
    engineerTotal,
    companyMargin,
  };
}

// ---- Per-engineer breakdown of ONE job ----
//
// A split job is not one payout. Gas at £70 to Aaron, EPC at £129.99 to
// Rizwan and an EICR still unassigned are three different fees, worked out
// three different ways — Aaron might be on fixed per-service rates while
// Rizwan is on a percentage, and each of them has their own rate table.
// Showing a single "engineer share · 40%" against the job total was wrong in
// every one of those cases, and wrong by a lot.
//
// This is the one place that decides who is owed what on a job. The job
// detail Financials card and the engineer statements in lib/stats.js both
// resolve a line's engineer the same way (line override → its visit → the
// job), so the number on the job always matches the number on the payslip.
export function jobFinancialsSplit(job, engineerById) {
  const jobValue = Number(job?.price) || 0;
  const allLines = getJobLines(job || {});

  // Group every line by whoever is responsible for it. Add-ons (parking,
  // congestion) have no engineer of their own and fall to the job's engineer,
  // exactly as the reports treat them.
  const groups = new Map();
  for (const l of allLines) {
    const id = lineEngineerId(job, l) || "unassigned";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(l);
  }

  // A group holding nothing but add-ons isn't an engineer's work — it's a
  // charge sitting on the job. Don't invent a labour fee for it.
  const working = [...groups.entries()].filter(([, lines]) =>
    lines.some((l) => !isAddonCode(l.code))
  );

  const parking = parkingReconcile(job);
  const single = working.length <= 1;

  const shares = working.map(([engineerId, lines]) => {
    const engineer = engineerById ? engineerById(engineerId) : null;
    // Add-ons (parking, congestion) are a pass-through: charged to the
    // customer, paid back to the engineer against a RECEIPT, and reconciled in
    // the parking summary below. They are not work, so they never form part of
    // anyone's pay base — a percentage engineer taking 40% of a £5 parking
    // charge was being commissioned on money that isn't ours or theirs.
    const realLines = lines.filter((l) => !isAddonCode(l.code));
    const revenue = realLines.reduce((s, l) => s + lineTotal(l), 0);
    const unassigned = !engineerId || engineerId === "unassigned";

    // Nobody to pay, or nobody priced yet. Both used to silently resolve to
    // "40% of the job", which was never a real rate — it was the fallback
    // showing through. Pay here is UNKNOWN, and unknown is shown as unknown:
    // £0 payable and a prompt to set the rate, not a fabricated figure.
    if (unassigned || !hasPayConfig(engineer)) {
      return {
        engineerId: engineerId || "unassigned",
        engineer,
        name: engineer?.name || (unassigned ? "Not assigned" : engineerId),
        unassigned,
        rateUnknown: true,
        reason: unassigned ? "no_engineer" : "no_rates",
        lines: realLines,
        revenue,
        net: 0, vat: 0, payable: 0,
        cutPercent: 0,
        payType: engineer?.payType || null,
        applianceCount: 0,
        missingRates: [],
      };
    }

    const payType = engineer.payType || "per_job";
    const gasLine = lines.find((l) => l.code === "GAS");
    const applianceCount = gasLine
      ? Math.max(1, Math.round(Number(gasLine.qty) || 1))
      : (job?.gasAppliances || 1);
    const pay = engineerPayout({
      jobValue: revenue,
      cutPercent: engineer?.cutPercent != null ? Number(engineer.cutPercent) : 40,
      vatRegistered: !!engineer?.vatRegistered,
      payType,
      gasBaseRate: engineer?.gasBaseRate != null ? Number(engineer.gasBaseRate) : DEFAULT_GAS_BASE_RATE,
      gasExtraRate: engineer?.gasExtraRate != null ? Number(engineer.gasExtraRate) : DEFAULT_GAS_EXTRA_RATE,
      applianceCount,
      serviceRates: engineer?.serviceRates || {},
      jobLines: lines,
      // A manual override is a single figure for the job. Handing the same
      // figure to three engineers would pay it three times, so it only
      // applies when one person is doing the whole job.
      overrideNet: single ? job?.engineerPayOverride : undefined,
    });
    // Services this engineer is doing that they have no price against —
    // paid at the house default, and said so on screen.
    const missingRates = ["fixed_service", "fixed_gas"].includes(payType)
      ? realLines
          .filter((l) => l.code !== "GAS" && !hasRateForLine(l, engineer.serviceRates))
          .map((l) => l.code)
      : [];

    return {
      engineerId,
      engineer,
      name: engineer?.name || engineerId,
      unassigned: false,
      rateUnknown: false,
      lines: realLines,
      revenue,
      missingRates,
      ...pay, // net, vat, payable, cutPercent, payType, applianceCount, overridden
    };
  });

  const labourPayable = shares.reduce((s, x) => s + x.payable, 0);
  // Margin can't be trusted while any part of the job has no rate behind it.
  const unpriced = shares.filter((x) => x.rateUnknown);
  const engineerTotal = labourPayable + parking.reimbursed;
  return {
    jobValue,
    shares,
    split: shares.length > 1,
    labourNet: shares.reduce((s, x) => s + x.net, 0),
    labourVat: shares.reduce((s, x) => s + x.vat, 0),
    labourPayable,
    parking,
    engineerTotal,
    companyMargin: jobValue - labourPayable - parking.reimbursed,
    unpriced,
    provisional: unpriced.length > 0,
  };
}

// ---- Transfer gross-up for engineer payments ----
// The bank takes a flat fee out of every transfer, so sending exactly what an
// engineer earned leaves them short. We send earnings + fee; they bank the
// earnings in full.
//
// Charged PER TRANSFER, not per job — one payment covering eight jobs costs
// one fee. That is why this is a payment-level helper and deliberately has no
// per-job equivalent: applying it inside engineerPayout() would multiply the
// fee by the number of jobs in the run.
//
// Returns:
//   earnings  — what the engineer is owed and will actually receive
//   fee       — the bank's cut, absorbed by the company
//   send      — the figure to actually enter into the banking app
export function grossUpTransfer(earnings, fee = DEFAULT_TRANSFER_FEE) {
  const net = round2(Number(earnings) || 0);
  const f = round2(Number(fee) || 0);
  // A zero/negative payment isn't a transfer, so it incurs no fee.
  if (net <= 0) return { earnings: net, fee: 0, send: net };
  return { earnings: net, fee: f, send: round2(net + f) };
}

// Money must not drift on repeated addition — 0.74 in binary floating point
// is not exact, and these figures get summed across whole periods.
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---- Aggregate parking across many jobs (weekly summary) ----
export function parkingSummary(jobs = []) {
  let collected = 0;
  let reimbursed = 0;
  jobs.forEach((j) => {
    const p = parkingReconcile(j);
    collected += p.charged;
    reimbursed += p.reimbursed;
  });
  return { collected, reimbursed, net: collected - reimbursed };
}

// ---- Congestion zone charge, reconciled the same way parking is ----
// Billed on top of the job like parking, and (like parking) the company only
// really KEEPS the difference between what the customer was charged and what
// was reimbursed to the engineer against a receipt. Nothing previously
// summarised it at all — it was excluded from labour and then never counted
// anywhere, so the margin on it was invisible.
export function congestionReconcile(job) {
  const lines = getJobLines(job || {});
  const line = lines.find((l) => l.code === "CONGESTION" && !l.waived);
  const lineCharge = line ? lineTotal(line) : 0;
  const servicesFallback =
    lineCharge === 0 && (job?.services || []).includes("CONGESTION")
      ? DEFAULT_CONGESTION_CHARGE
      : 0;
  const charged =
    job?.congestionAmountCharged != null && job.congestionAmountCharged !== ""
      ? Number(job.congestionAmountCharged) || 0
      : lineCharge || servicesFallback;
  const receiptSubmitted = !!job?.congestionReceiptSubmitted;
  const receiptAmount = Number(job?.congestionReceiptAmount) || 0;
  const reimbursed = receiptSubmitted ? receiptAmount : 0;
  return { charged, receiptSubmitted, receiptAmount, reimbursed, retained: charged - reimbursed };
}

export function congestionSummary(jobs = []) {
  let collected = 0;
  let reimbursed = 0;
  jobs.forEach((j) => {
    const c = congestionReconcile(j);
    collected += c.charged;
    reimbursed += c.reimbursed;
  });
  return { collected, reimbursed, net: collected - reimbursed };
}
