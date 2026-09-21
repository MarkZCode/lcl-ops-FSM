// Builds the text for engineer "job cards".
//
// Two variants:
//   • Quote / offer card  — what we send an engineer to ASK if they'll take the
//     job. Confidential: NO tenant/owner phone number and NO notes.
//   • Assigned card        — what we send AFTER they confirm. Includes the
//     contact number, the "call before" instruction and the notes so they can
//     actually attend.
import { format } from "date-fns";
import { toDate, getJobLines, isAddonCode } from "./format";
import { CERT_LABELS } from "./constants";

// What size to SHOW for a service on a job card.
//
// "1–3 Bedrooms" is the CUSTOMER-facing price band — one price covers all
// three sizes. But when the office has recorded the actual bedroom count on
// the line (see the "Exact bedrooms" picker in JobModal), the engineer being
// sent to the property should be told the real size rather than the band:
// "2 Bedrooms", not "1–3 Bedrooms". Falls back to the band whenever no exact
// count was picked, which is the common case.
//
// Display only. Both the customer price and the engineer-pay lookup are
// untouched — they read line.tier and line.bedroomCount exactly as before.
export function lineSizeLabel(line) {
  const n = Number(line?.bedroomCount);
  if (Number.isFinite(n) && n > 0) return n === 1 ? "1 Bedroom" : `${n} Bedrooms`;
  // Gas is priced per appliance rather than by a size band, so the count IS
  // its size — an engineer reading "Gas Safety Certificate (CP12)" alone
  // can't tell whether they're attending one appliance or four.
  if (line?.code === "GAS") {
    const q = Math.max(1, Math.round(Number(line.qty) || 1));
    return `${q} appliance${q === 1 ? "" : "s"}`;
  }
  return line?.tier || "";
}

export function certLabel(code) {
  return CERT_LABELS[code] || code;
}

// "Today" / "Tomorrow" / "Yesterday" / "Wed 8 Jun".
export function relativeDay(value) {
  const d = toDate(value);
  if (!d) return "TBC";
  const a = new Date(d);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(d, "EEE d MMM");
}

// "08:00" -> "8", "08:30" -> "8:30"
// 12-hour format: "08:00" -> "8am", "13:00" -> "1pm", "13:30" -> "1:30pm".
function trimTime(t) {
  if (!t) return "";
  const [h, m = "00"] = String(t).split(":");
  const hh = parseInt(h, 10);
  if (isNaN(hh)) return "";
  const ampm = hh >= 12 ? "pm" : "am";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return m === "00" ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
}

function startTime(job) {
  if (job.windowFrom) return trimTime(job.windowFrom);
  const d = toDate(job.scheduledAt);
  return d ? trimTime(format(d, "HH:mm")) : "";
}

// "(8–10) morning" / "(from 8) afternoon" / "morning" / ""
export function windowStr(job) {
  const start = startTime(job);
  const end = job.windowTo ? trimTime(job.windowTo) : "";
  let w = "";
  if (start && end) w = `(${start}–${end})`;
  else if (start) w = `(from ${start})`;
  const part = job.windowPart ? job.windowPart.toLowerCase() : "";
  return [w, part].filter(Boolean).join(" ");
}

// "Tomorrow (8–10) morning"
export function dateLine(job) {
  return [relativeDay(job.scheduledAt), windowStr(job)].filter(Boolean).join(" ");
}

export function nameOnCert(job, client) {
  return (job.nameOnCert && job.nameOnCert.trim()) || client?.name || "—";
}

// Everyone who can let the engineer in. A property often has more than one
// tenant, or a tenant plus a neighbour holding a key — one name and number was
// never enough, and the second contact ended up buried in the notes.
//
// Stored as job.accessContacts = [{ name, phone }]. The old single
// accessName/accessPhone pair is still read as the first contact, so existing
// jobs need no migration and keep working exactly as before.
export function accessContacts(job, client) {
  const list = Array.isArray(job?.accessContacts) ? job.accessContacts : [];
  const cleaned = list
    .map((c) => ({ name: (c?.name || "").trim(), phone: (c?.phone || "").trim() }))
    .filter((c) => c.name || c.phone);
  if (cleaned.length) return cleaned;
  const legacyName = (job?.accessName || "").trim();
  const legacyPhone = (job?.accessPhone || "").trim();
  if (legacyName || legacyPhone) return [{ name: legacyName, phone: legacyPhone }];
  // Nothing specific on the job — fall back to the client's own number.
  return client?.phone ? [{ name: "", phone: client.phone }] : [];
}

// First contact's phone/name — kept so existing callers keep working.
export function accessPhone(job, client) {
  return accessContacts(job, client)[0]?.phone || "";
}

export function accessName(job) {
  return accessContacts(job)[0]?.name || "";
}

// Returns the plain-text job card (used for copy / WhatsApp / preview).
// Pass `lines` to render only a subset (e.g. one engineer's services) and
// `engineerName` to label whose card it is.
export function jobCardText(
  job,
  client,
  property,
  { assigned = false, lines, engineerName } = {}
) {
  const allCardLines = lines || getJobLines(job);
  // NO card ever lists add-on charges (parking, congestion) as work.
  //
  // A job card tells an engineer what to DO. Parking is a charge on the
  // customer's invoice and a receipt-backed reimbursement — it is not a
  // certificate and not a task, so listing it under "Cert type" reads as
  // though they've been booked to do something called Parking Charge. The
  // assigned card used to include them; it shouldn't.
  const cardLines = allCardLines.filter((l) => !isAddonCode(l.code));
  const certNames = cardLines.map((l) => {
    const base = l.code === "CUSTOM" ? l.name : certLabel(l.code);
    const size = lineSizeLabel(l);
    return size ? `${base} (${size})` : base;
  });
  const gas = cardLines.find((l) => l.code === "GAS");
  const out = [];

  out.push(assigned ? "✅ ASSIGNED JOB CARD" : "📋 JOB OFFER — please confirm");
  if (engineerName) out.push(`Engineer: ${engineerName}`);
  out.push(`Ref: ${job.id}`);
  out.push("");

  if (assigned) {
    const contacts = accessContacts(job, client);
    contacts.forEach((c, i) => {
      const label = contacts.length > 1 ? `Access ${i + 1}` : "Access via";
      if (c.name) out.push(`${label} : ${c.name}`);
      if (c.phone) out.push(c.name ? c.phone : `${label} : ${c.phone}`);
    });
    if (job.callBefore) out.push(job.callBefore);
  }

  out.push("");
  if (certNames.length) out.push(`Cert type : ${certNames.join(", ")}`);
  out.push(`Date : ${dateLine(job)}`);
  if (gas) {
    const q = gas.qty || 1;
    out.push(`${q} Appliance${q > 1 ? "s" : ""}`);
  }
  if (assigned) {
    out.push(`Name on cert : ${nameOnCert(job, client)}`);
    if (property?.label || property?.postcode) {
      out.push(`Address : ${[property.label, property.postcode].filter(Boolean).join(", ")}`);
    } else {
      out.push(`Address : NOT ON FILE — check with the office before attending`);
    }
    // Notes, scoped to whatever lines this card is for. `lines` is already
    // filtered to a single engineer when the job is split, so per-line notes
    // reach only the person doing that service — the whole point of them.
    // Job-level notes apply to everyone and are always included.
    const lineNotes = (lines || [])
      .filter((l) => l?.notes && l.notes.trim())
      .map((l) => `  · ${l.code === "CUSTOM" ? l.name : certLabel(l.code)}: ${l.notes.trim()}`);
    if ((job.notes && job.notes.trim()) || lineNotes.length) {
      out.push("");
      if (job.notes && job.notes.trim()) out.push(`Notes : ${job.notes.trim()}`);
      if (lineNotes.length) {
        if (!(job.notes && job.notes.trim())) out.push("Notes :");
        out.push(...lineNotes);
      }
    }
  } else {
    // Postcode only — never the full street address — on offer cards.
    if (property?.postcode) out.push(`Postcode : ${property.postcode}`);
  }

  if (!assigned) {
    out.push("");
    out.push("Can you take this job? Please reply to confirm. 👍");
  }

  return out.join("\n");
}

// ── Per-engineer acceptance ──────────────────────────────────────────────
//
// Confirmation used to be one boolean on the job. On a split job that was
// simply false: marking it confirmed because the gas engineer replied "yes"
// also silently declared the EPC and the EICR accepted, by people who had
// never been asked. Nobody chased them, and the job looked ready when two
// thirds of it wasn't.
//
// A job now carries `cardConfirmations` — one timestamp per CARD that gets
// sent out, keyed the same way the card modal splits them:
//   • `<engineerId>` when different engineers are doing different services
//   • `line:<lineId>` when one job's services are being offered around
//     individually before anyone is assigned
//   • `job` for the ordinary single-engineer job
//
// `engineerConfirmed` is still written, and still means what every existing
// consumer (the reminder crons, the job header badge) assumes it means:
// EVERYONE on this job has accepted. It's derived, never set on its own.

// The cards this job splits into — the unit at which acceptance is tracked.
export function cardScopes(job, engineerById) {
  const lines = getJobLines(job || {});
  const real = lines.filter((l) => !isAddonCode(l.code));
  const engOf = (l) => l.engineerId || job?.engineerId || "unassigned";
  // Only REAL work gets a card. Deriving the engineer list from every line
  // included the parking charge, which has no engineer of its own — so any job
  // with parking grew a phantom "Unassigned" card that nobody could ever
  // accept, and the job could never reach "all confirmed".
  const engIds = [...new Set(real.map(engOf))];
  const nameOf = (id) =>
    !id || id === "unassigned" ? "" : (engineerById?.(id)?.name || id);
  const svc = (l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code));

  // A SPLIT job is dispatched as visits, so the visit is what gets sent and
  // what gets accepted. Deriving scopes from lines instead meant the card
  // modal and the Visits panel described the same job two different ways.
  if (Array.isArray(job?.visits) && job.visits.length) {
    return job.visits
      .filter((v) => v.status !== "cancelled")
      .map((v, i) => {
        const vLines = real.filter((l) => (v.lineIds || []).includes(l.id));
        const id = v.engineerId || job?.engineerId || "unassigned";
        return {
          key: `visit:${v.id}`,
          visitId: v.id,
          engineerId: id,
          label: nameOf(id) || `Visit ${i + 1}`,
          sub: vLines.map(svc).join(", ") || "No services on this visit",
        };
      });
  }

  if (engIds.length > 1) {
    return engIds.map((id) => ({
      key: id,
      engineerId: id,
      label: id === "unassigned" ? "Unassigned" : (engineerById?.(id)?.name || id),
      sub: real
        .filter((l) => engOf(l) === id)
        .map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code)))
        .join(", "),
    }));
  }

  if (real.length > 1) {
    return real.map((l) => ({
      key: `line:${l.id}`,
      lineId: l.id,
      engineerId: engOf(l),
      label: l.code === "CUSTOM" ? l.name : certLabel(l.code),
      sub: engOf(l) === "unassigned" ? "Not assigned yet" : (engineerById?.(engOf(l))?.name || ""),
    }));
  }

  const only = engIds[0] || "unassigned";
  return [{
    key: "job",
    engineerId: only,
    label: only === "unassigned" ? "Unassigned" : (engineerById?.(only)?.name || "Engineer"),
    sub: real.map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code))).join(", "),
  }];
}

// Read a scope's acceptance, honouring the pre-`cardConfirmations` flag so
// jobs confirmed before this existed don't all reset to unconfirmed.
export function scopeConfirmedAt(job, key) {
  const map = job?.cardConfirmations;
  if (map && Object.keys(map).length) return map[key] || null;
  return job?.engineerConfirmed ? (job.confirmedAt || true) : null;
}

export function isScopeConfirmed(job, key) {
  return !!scopeConfirmedAt(job, key);
}

// The patch to apply when one engineer accepts (or un-accepts) their card.
// Also recomputes the job-wide flag, which stays true only when every card
// on the job has come back.
export function setScopeConfirmed(job, key, on, engineerById) {
  const scopes = cardScopes(job, engineerById);
  const existing = job?.cardConfirmations && Object.keys(job.cardConfirmations).length
    ? { ...job.cardConfirmations }
    // Migrating a legacy all-or-nothing flag: it applied to everyone, so
    // seed every scope with it before changing the one being edited.
    : job?.engineerConfirmed
      ? Object.fromEntries(scopes.map((s) => [s.key, job.confirmedAt || new Date().toISOString()]))
      : {};

  if (on) existing[key] = new Date().toISOString();
  else delete existing[key];

  const all = scopes.length > 0 && scopes.every((s) => !!existing[s.key]);
  const stamps = scopes.map((s) => existing[s.key]).filter(Boolean).sort();
  return {
    cardConfirmations: existing,
    engineerConfirmed: all,
    confirmedAt: all ? stamps[stamps.length - 1] : null,
  };
}

// A card is only genuinely accepted when there is somebody to have accepted
// it. Existing jobs can hold a confirmation recorded before that rule existed
// — against a scope whose engineer is still Unassigned — which is what let a
// job show "All engineers confirmed" beside a Financials panel reading "No
// engineer assigned". Reading acceptance through this keeps the two honest.
export function scopeAccepted(job, sc) {
  if (!sc?.engineerId || sc.engineerId === "unassigned") return false;
  return isScopeConfirmed(job, sc.key);
}

// { done, total, all } for a job's cards — the one place that counts them.
export function acceptanceProgress(job, engineerById) {
  const scopes = cardScopes(job, engineerById);
  const done = scopes.filter((sc) => scopeAccepted(job, sc)).length;
  return { done, total: scopes.length, all: scopes.length > 0 && done === scopes.length, scopes };
}
