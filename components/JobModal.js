"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { FiUserPlus, FiPlus, FiTrash2, FiAlertTriangle, FiEdit2 } from "react-icons/fi";
import PostcodeInput from "./PostcodeInput";
import Modal from "./Modal";
import ClientModal from "./ClientModal";
import ConfirmDialog from "./ConfirmDialog";
import { useStore } from "@/lib/store";
import {
  UNASSIGNED_ENGINEER,
  STATUS_ORDER,
  CANCEL_REASONS,
  DISCOUNT_PRESETS,
  statusMeta,
  TIME_PARTS,
  WINDOW_PRESETS,
  CALL_BEFORE_OPTIONS,
} from "@/lib/constants";
import { gbp, lineTotal, linesTotal, getJobLines, lineGross, jobPayable } from "@/lib/format";
import { detectConflicts } from "@/lib/dispatch";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";
import DurationPicker from "@/components/DurationPicker";

function toLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000);
}
function toDateInput(iso) {
  const d = toLocal(iso);
  return d ? d.toISOString().slice(0, 10) : "";
}
function toTimeInput(iso) {
  const d = toLocal(iso);
  return d ? d.toISOString().slice(11, 16) : "";
}

const emptyForm = {
  clientId: "",
  propertyId: "",
  lines: [], // [{ id, code, name, unit, qty, total? }] — editable quote lines
  status: "quote",
  engineerId: "unassigned",
  scheduledDate: "", // arrival date (no time)
  discount: "",       // £ off the whole job
  discountReason: "", // WHY — one of DISCOUNT_PRESETS, so it can be counted
  // How long the visit is expected to take, in minutes. Distinct from the
  // arrival WINDOW (windowFrom/windowTo), which is the span the client is
  // told to be in — a 3-hour window can hold a 45-minute job.
  durationMinutes: 0,
  windowFrom: "", // arrival window start (HH:mm)
  windowTo: "", // arrival window end (HH:mm)
  windowPart: "", // Morning / Afternoon / Evening
  nameOnCert: "", // who the certificate is issued to (defaults to client name)
  // Everyone who can let the engineer in. Always at least one blank row so
  // the fields are visible without clicking "add".
  accessContacts: [{ name: "", phone: "" }],
  callBefore: "", // engineer call instruction (shown on assigned job card)
  price: 0,
  notes: "",
};

const emptyNewClient = {
  name: "",
  phone: "",
  email: "",
  propertyLabel: "",
  postcode: "",
};

const emptyCustom = { name: "", price: "" };

let customSeq = 0;


export default function JobModal({ open, onClose, job, defaultClientId, prefillNew }) {
  const { clients, jobs, addJob, updateJob, addClient, updateClient, catalog, engineers, logActivity } = useStore();

  // Cancelling from the edit form goes through the same requirement as the
  // status buttons on the job page: a reason, or it doesn't save.
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [priceTouched, setPriceTouched] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClient, setNewClient] = useState(emptyNewClient);
  // Adding a property to an EXISTING (already-selected) client — separate
  // from `creatingClient` above, which is for a brand-new client. Needed
  // because a client can exist with zero properties on file (e.g. the job
  // was created before an address was known), and until now there was
  // simply no way to add one from here — the dropdown just said "No
  // properties on file" with no path forward.
  const [addingProperty, setAddingProperty] = useState(false);
  const [newProperty, setNewProperty] = useState({ label: "", postcode: "" });
  // Lets the user view/fix a client's full record (name, phone, email,
  // company, notes, every property) without leaving the job form — e.g. a
  // client whose postcode never got saved (see the propertyLabel/postcode
  // bug fixed above) previously had no way to be corrected except abandoning
  // the job and hunting them down on the separate Clients page.
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Changes to the services or price of an existing quote, waiting for a yes.
  const [quoteChanges, setQuoteChanges] = useState(null);
  const [custom, setCustom] = useState(emptyCustom);
  const snapshotRef = useRef(""); // initial form state, to detect unsaved edits
  const initRef = useRef(null);
  const isEdit = Boolean(job);

  // Does the client being typed already exist? Email/phone are the reliable
  // identifiers (people re-type names inconsistently), so those match first;
  // an exact name match is the weaker fallback.
  const possibleDuplicate = useMemo(() => {
    if (!creatingClient) return null;
    const norm = (v) => (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = norm(newClient.email);
    const phone = norm(newClient.phone);
    const name = norm(newClient.name);
    if (!email && !phone && name.length < 3) return null;
    for (const c of clients) {
      if (email && norm(c.email) === email) return { ...c, matchedOn: "email" };
      // Compare the last 10 digits — 07990916735 and +44 7990 916735 are one number.
      if (phone.length >= 7 && norm(c.phone).slice(-10) === phone.slice(-10)) return { ...c, matchedOn: "phone" };
    }
    const byName = clients.find((c) => norm(c.name) === name && name.length >= 3);
    return byName ? { ...byName, matchedOn: "name" } : null;
  }, [creatingClient, newClient.email, newClient.phone, newClient.name, clients]);

  // Live double-booking check — the Dispatch Board already flags overlaps
  // after the fact, but that's a separate page nobody's looking at while
  // actually scheduling here. Build a draft job from the in-progress form
  // and run it through the same conflict detector against everyone else's
  // real bookings, so the clash is visible before Save is even clicked.
  const conflictWith = useMemo(() => {
    if (!form.engineerId || form.engineerId === "unassigned" || !form.scheduledDate) return null;
    const draftId = "__draft__";
    const draft = {
      id: draftId,
      engineerId: form.engineerId,
      scheduledAt: ukDateTimeToUtcIso(form.scheduledDate, form.windowFrom || "09:00"),
      durationMinutes: Number(form.durationMinutes) || 0,
      windowFrom: form.windowFrom,
      windowTo: form.windowTo,
    };
    const others = (jobs || []).filter(
      (j) => j.id !== job?.id && j.engineerId === form.engineerId && j.status !== "cancelled"
    );
    for (const other of others) {
      if (detectConflicts([other, draft]).has(draftId)) return other;
    }
    return null;
  }, [form.engineerId, form.scheduledDate, form.windowFrom, form.windowTo, jobs, job?.id]);
  const conflictEngineerName = conflictWith ? engineers.find((e) => e.id === form.engineerId)?.name : null;

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = job ? `job-${job.id}` : `new-${defaultClientId}-${prefillNew?.propertyId || ""}`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;
    // Brand-new job with nobody pre-selected → start on "Add new client".
    // Most new jobs are for someone not yet on file, and starting on "Select
    // existing" meant an extra click every time plus a scroll through a long
    // dropdown to confirm they weren't there. Editing an existing job, or
    // creating one from a client's page (defaultClientId), still starts on
    // the existing-client picker.
    setCreatingClient(!job && !defaultClientId);
    setNewClient(emptyNewClient);
    setAddingProperty(false);
    setNewProperty({ label: "", postcode: "" });
    setCustom(emptyCustom);
    let f;
    if (job) {
      f = {
        clientId: job.clientId || "",
        propertyId: job.propertyId || "",
        lines: getJobLines(job).map((l) => ({ ...l })),
        status: job.status || "quote",
        engineerId: job.engineerId || "unassigned",
        scheduledDate: toDateInput(job.scheduledAt),
        discount: job.discount != null && job.discount !== "" ? String(job.discount) : "",
        discountReason: job.discountReason || "",
        durationMinutes: Number(job.durationMinutes) || 0,
        windowFrom: job.windowFrom || toTimeInput(job.scheduledAt),
        windowTo: job.windowTo || "",
        windowPart: job.windowPart || "",
        nameOnCert: job.nameOnCert || "",
        // Read the new list, falling back to the old single pair so jobs
        // saved before this change open with their contact intact.
        accessContacts:
          Array.isArray(job.accessContacts) && job.accessContacts.length
            ? job.accessContacts.map((c) => ({ name: c?.name || "", phone: c?.phone || "" }))
            : [{ name: job.accessName || "", phone: job.accessPhone || "" }],
        callBefore: job.callBefore || "",
        price: job.price ?? 0,
        notes: job.notes || "",
      };
      setForm(f);
      setPriceTouched(true);
    } else {
      f = {
        ...emptyForm,
        lines: [],
        clientId: prefillNew?.clientId || defaultClientId || "",
        propertyId: prefillNew?.propertyId || "",
        nameOnCert: prefillNew?.nameOnCert || "",
        notes: prefillNew?.notes || "",
        ...(prefillNew?.relatedJobId
          ? { relatedJobId: prefillNew.relatedJobId, relationType: prefillNew.relationType }
          : {}),
      };
      setForm(f);
      setPriceTouched(false);
    }
    snapshotRef.current = JSON.stringify(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job, defaultClientId]);

  // Has the user entered/changed anything that isn't saved yet?
  const isDirty = () => {
    if (
      creatingClient &&
      (newClient.name.trim() ||
        newClient.phone.trim() ||
        newClient.email.trim() ||
        newClient.propertyLabel.trim())
    )
      return true;
    if (addingProperty && (newProperty.label.trim() || newProperty.postcode.trim())) return true;
    return JSON.stringify(form) !== snapshotRef.current;
  };

  // Intercept close (backdrop / X / Cancel) to warn before losing edits.
  const handleClose = () => {
    // In-app dialog, not window.confirm — the native one renders as a browser
    // alert with an "lcl-ops.vercel.app says" header sitting on top of the
    // modal, which looks like something has gone wrong rather than a question.
    if (isDirty()) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const client = clients.find((c) => c.id === form.clientId);
  const properties = client?.properties || [];

  const linesSubtotal = linesTotal(form.lines);
  // A discount can't exceed the job or turn into a credit.
  const jobDiscountAmt = Math.max(0, Math.min(linesSubtotal, Number(form.discount) || 0));
  const breakdownTotal = Math.max(0, linesSubtotal - jobDiscountAmt);

  // Keep the headline price in sync with the breakdown whenever the LINES
  // change — auto-resync, not a "click to sync" prompt someone has to
  // notice and act on. A direct edit to the price field itself (below)
  // still sticks as the displayed value until the next line-item change,
  // so a deliberate one-off override isn't fought while you're typing it.
  useEffect(() => {
    setForm((f) => {
      const sub = linesTotal(f.lines);
      const off = Math.max(0, Math.min(sub, Number(f.discount) || 0));
      const total = Math.max(0, sub - off);
      if (Math.abs((Number(f.price) || 0) - total) < 0.005) return f;
      return { ...f, price: total };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lines, form.discount]);

  // Engineer dropdowns only show engineers qualified for the service(s) in
  // question — a GAS-only job shouldn't offer up an EICR-only engineer. Falls
  // back to the full roster if nothing matches (e.g. no engineer onboarded
  // for that service yet, or a legacy engineer record with no `services`
  // set) so assignment is never silently blocked.
  const jobServiceCodes = new Set(form.lines.map((l) => l.code).filter(Boolean));
  const qualifiedFor = (codes) => {
    if (!codes.size) return engineers; // no service picked yet — show everyone
    const matches = engineers.filter((e) => (e.services || []).some((s) => codes.has(s)));
    return matches.length ? matches : engineers;
  };
  // Main "Engineer" select — qualified for ANY service on the job (a job can
  // have its lines split across different engineers via the per-line select
  // below, so the job-level engineer just needs to cover at least one).
  const engineerOptions = [...qualifiedFor(jobServiceCodes), UNASSIGNED_ENGINEER];

  // Adds a NEW line every time — deliberately not a toggle. A client with
  // multiple properties often needs the same service quoted several times
  // in one job (e.g. Gas Safety for 3 separate flats), each its own line
  // with its own tier/price/qty. Removing a line is a separate, explicit
  // action (the trash icon per line in the breakdown below) so clicking the
  // same service button again can't accidentally wipe out an existing line.
  const addServiceLine = (code) => {
    setForm((f) => {
      const s = catalog.find((x) => x.code === code);
      const firstTier = s?.tiers?.[0];
      const line = {
        id: `ln-${code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        code,
        name: s ? s.name : code,
        unit: firstTier ? firstTier.price : s ? s.price : 0,
        qty: 1,
        ...(firstTier ? { tier: firstTier.label } : {}),
        // Snapshot the currently-configured extra-appliance rate onto the
        // line at creation — see lib/format.js's lineTotal() for why this
        // needs to travel with the line rather than being looked up live.
        ...(code === "GAS" ? { gasExtra: s?.gasExtra } : {}),
      };
      return { ...f, lines: [...f.lines, line] };
    });
  };

  // Pick a size/quantity tier for a line → sets its unit price.
  const setLineTier = (id, label) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => {
        if (l.id !== id) return l;
        const cat = catalog.find((c) => c.code === l.code);
        const t = cat?.tiers?.find((x) => x.label === label);
        return { ...l, tier: label, unit: t ? t.price : l.unit, total: undefined };
      }),
    }));
  };

  const updateLine = (id, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  // Changing quantity recomputes the default price (drops any manual override).
  const setLineQty = (id, qty) => {
    const q = Math.max(1, Math.round(Number(qty) || 1));
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) =>
        l.id === id ? { ...l, qty: q, total: undefined } : l
      ),
    }));
  };

  const setLineTotal = (id, val) =>
    updateLine(id, { total: val === "" ? undefined : val });

  // Selecting a part of day auto-fills the arrival window (still editable).
  const setWindowPart = (part) => {
    const preset = WINDOW_PRESETS[part];
    setForm((f) => ({
      ...f,
      windowPart: part,
      ...(preset ? { windowFrom: preset.from, windowTo: preset.to } : {}),
    }));
  };

  const removeLine = (id) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }));

  const addCustomLine = () => {
    const name = custom.name.trim();
    if (!name) return;
    const price = Number(custom.price) || 0;
    const line = {
      id: `ln-custom-${++customSeq}-${Date.now().toString(36)}`,
      code: "CUSTOM",
      name,
      unit: price,
      qty: 1,
    };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setCustom(emptyCustom);
  };

  // Moving a job INTO cancelled needs a reason. A job that's already
  // cancelled with one recorded doesn't get asked again on every edit.
  const needsCancelReason =
    form.status === "cancelled" && !(job?.status === "cancelled" && job?.cancelReason);
  const cancelReasonValid =
    !needsCancelReason ||
    (!!cancelReason &&
      (!CANCEL_REASONS.find((r) => r.key === cancelReason)?.requiresNote ||
        cancelNote.trim().length > 2));

  // Valid when we have at least one line AND a client (existing or new).
  const canSave =
    (form.lines.length > 0 || custom.name.trim().length > 0) &&
    cancelReasonValid &&
    (creatingClient ? newClient.name.trim().length > 0 : Boolean(form.clientId));

  // Editing the services or the price of an existing job is never silent:
  // the list of what is about to change is shown first, and nothing is saved
  // until it is confirmed. (A wrong service once landed on a quote unnoticed.)
  const quoteDiff = () => {
    if (!isEdit) return [];
    const tally = (items) => {
      const m = new Map();
      for (const l of items || []) {
        const key = l.code === "CUSTOM" ? `CUSTOM:${l.name}` : l.code;
        if (!key) continue;
        m.set(key, { name: l.name || l.code, qty: (m.get(key)?.qty || 0) + Math.max(1, Math.round(Number(l.qty) || 1)) });
      }
      return m;
    };
    const was = tally(getJobLines(job)), now = tally([...form.lines, ...(custom.name.trim() ? [{ code: "CUSTOM", name: custom.name.trim(), qty: 1 }] : [])]);
    const out = [];
    for (const [k, l] of now) {
      const b = was.get(k);
      if (!b) out.push(`Add ${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`);
      else if (b.qty !== l.qty) out.push(`${l.name}: ×${b.qty} → ×${l.qty}`);
    }
    for (const [k, l] of was) if (!now.has(k)) out.push(`Remove ${l.name}`);
    const before = jobPayable(job);
    const sub = linesTotal(form.lines) + (custom.name.trim() ? Number(custom.price) || 0 : 0);
    const after = Math.max(0, sub - Math.max(0, Math.min(sub, Number(form.discount) || 0)));
    if (Math.abs(before - after) >= 0.005) out.push(`Total: ${gbp(before)} → ${gbp(after)}`);
    return out;
  };

  const handleSave = () => {
    if (!canSave) return;
    const changes = quoteDiff();
    if (changes.length) { setQuoteChanges(changes); return; }
    doSave();
  };

  const doSave = () => {
    if (!canSave) return;

    // Flush a custom service that was TYPED but never "+"-ed.
    //
    // The little + button was the only way to turn that text into a line, so
    // filling in "Legionella Risk Assessment / £120" and going straight to
    // Create job silently threw it away — the service you just entered simply
    // wasn't on the job. Nothing about the form said the + was mandatory, and
    // pressing Save is a clearer statement of intent than the + ever was.
    let lines = form.lines;
    const pendingName = custom.name.trim();
    if (pendingName) {
      lines = [
        ...lines,
        {
          id: `ln-custom-${++customSeq}-${Date.now().toString(36)}`,
          code: "CUSTOM",
          name: pendingName,
          unit: Number(custom.price) || 0,
          qty: 1,
        },
      ];
    }

    let clientId = form.clientId;
    let propertyId = form.propertyId;

    // Create the new client on the fly if in that mode.
    if (creatingClient) {
      // Was gated on propertyLabel alone — someone who filled in ONLY the
      // postcode (leaving the address/label field blank) got no property
      // record created at all, silently. The postcode/area they'd entered
      // was just discarded, with nothing on screen suggesting anything had
      // gone wrong. Create the property whenever EITHER field has content.
      const hasPropertyInfo = newClient.propertyLabel.trim() || newClient.postcode.trim();
      const properties = hasPropertyInfo
        ? [
            {
              id: "pr-" + Date.now().toString(36),
              label: newClient.propertyLabel.trim() || newClient.postcode.trim(),
              postcode: newClient.postcode.trim(),
              area: "",
              beds: 0,
            },
          ]
        : [];
      const created = addClient({
        name: newClient.name.trim(),
        phone: newClient.phone.trim(),
        email: newClient.email.trim(),
        type: "Landlord",
        properties,
      });
      clientId = created.id;
      propertyId = properties[0]?.id || "";
    } else if (
      addingProperty &&
      (newProperty.label.trim() || newProperty.postcode.trim()) &&
      client
    ) {
      // Add a new property to the ALREADY-EXISTING selected client — the
      // "No properties on file, and no way to add one" gap.
      //
      // EITHER field is enough. Requiring the label meant a postcode-only
      // entry was silently thrown away — and at quote stage a postcode is
      // often all the client gives you. Same bug the new-client flow had.
      const created = {
        id: "pr-" + Date.now().toString(36),
        label: newProperty.label.trim(),
        postcode: newProperty.postcode.trim(),
        area: "",
        beds: 0,
      };
      updateClient(client.id, { properties: [...(client.properties || []), created] });
      propertyId = created.id;
    }

    // Normalise lines and derive the back-compat fields (services/quantities)
    // that the rest of the app reads.
    const lineItems = lines.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      unit: Number(l.unit) || 0,
      qty: Math.max(1, Math.round(Number(l.qty) || 1)),
      ...(l.total != null && l.total !== ""
        ? { total: Number(l.total) || 0 }
        : {}),
      ...(l.engineerId ? { engineerId: l.engineerId } : {}),
      ...(l.tier ? { tier: l.tier } : {}),
      // Exact bedroom count within the "1–3 Bedrooms" quoting tier — pay-only,
      // never shown to the client. See lib/finance.js's rateForLine.
      ...(l.bedroomCount ? { bedroomCount: Number(l.bedroomCount) } : {}),
      ...(l.waived ? { waived: true } : {}),
      ...(Number(l.discount) > 0 ? { discount: Number(l.discount) } : {}),
    }));
    const services = lineItems
      .filter((l) => l.code !== "CUSTOM")
      .map((l) => l.code);
    const quantities = {};
    lineItems.forEach((l) => {
      if (l.code !== "CUSTOM") quantities[l.code] = l.qty;
    });

    const payload = {
      clientId,
      propertyId: propertyId || properties[0]?.id || "",
      services,
      lineItems,
      quantities,
      gasAppliances: quantities.GAS || 1,
      status: form.status,
      engineerId: form.engineerId,
      // Keep scheduledAt (date + window start) so dispatch/calendar still work.
      scheduledAt: form.scheduledDate
        ? ukDateTimeToUtcIso(form.scheduledDate, form.windowFrom || "09:00")
        : null,
      windowFrom: form.windowFrom,
      windowTo: form.windowTo,
      windowPart: form.windowPart,
      nameOnCert: form.nameOnCert.trim(),
      // Save the list, dropping blank rows. accessName/accessPhone are kept
      // in sync with the FIRST contact so anything still reading those fields
      // (older code paths, exports) keeps getting a sensible value.
      accessContacts: (form.accessContacts || [])
        .map((c) => ({ name: (c.name || "").trim(), phone: (c.phone || "").trim() }))
        .filter((c) => c.name || c.phone),
      accessName: ((form.accessContacts || [])[0]?.name || "").trim(),
      accessPhone: ((form.accessContacts || [])[0]?.phone || "").trim(),
      callBefore: form.callBefore,
      // Recomputed from the FLUSHED lines — using form.price here would miss a
      // custom service added by the flush above, saving a job whose total
      // didn't include the service that was just typed in.
      price: Math.max(0, linesTotal(lines) - Math.max(0, Math.min(linesTotal(lines), Number(form.discount) || 0))),
      discount: jobDiscountAmt > 0 ? jobDiscountAmt : undefined,
      discountReason: jobDiscountAmt > 0 ? (form.discountReason || "Discount") : undefined,
      notes: form.notes,
      ...(form.relatedJobId
        ? { relatedJobId: form.relatedJobId, relationType: form.relationType }
        : {}),
    };

    if (needsCancelReason) {
      const meta = CANCEL_REASONS.find((r) => r.key === cancelReason);
      payload.cancelledAt = new Date().toISOString();
      payload.cancelReason = cancelReason;
      payload.cancelReasonLabel = meta?.label || cancelReason;
      payload.cancelNote = cancelNote.trim();
    }

    if (isEdit) {
      if (Array.isArray(job.visits) && job.visits.length > 0) {
        const validLineIds = new Set(lineItems.map((l) => l.id));
        const cleanedVisits = job.visits
          .map((v) => ({
            ...v,
            lineIds: (v.lineIds || []).filter((id) => validLineIds.has(id)),
          }))
          .filter((v) => (v.lineIds && v.lineIds.length > 0) || v.scheduledAt || v.engineerId);
        payload.visits = cleanedVisits.length > 0 ? cleanedVisits : null;
      }
      updateJob(job.id, payload);
      if (needsCancelReason) {
        logActivity(job.id, {
          type: "status",
          title: `Cancelled — ${payload.cancelReasonLabel}`,
          detail: payload.cancelNote || "",
        });
      }
    } else {
      addJob(payload);
    }
    onClose();
  };

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      wide
      title={isEdit ? `Edit ${job.id}` : "New job"}
      footer={
        <>
          <button className="btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Save changes" : "Create job"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Client */}
        <div>
          <label className="label mb-1">Client</label>
          {!isEdit && (
            // "Add new client" first/prominent, "Select existing" as the
            // secondary side option — most new jobs here start from a fresh
            // client, so that path shouldn't be a small link tucked in the
            // corner behind the dropdown.
            <div className="mb-2 inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
              <button
                type="button"
                onClick={() => {
                  if (creatingClient) return;
                  setCreatingClient(true);
                  setForm((f) => ({ ...f, clientId: "", propertyId: "" }));
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  creatingClient ? "bg-brand-600 text-white" : "text-brand-600 hover:bg-brand-50"
                }`}
              >
                <FiUserPlus /> Add new client
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!creatingClient) return;
                  setCreatingClient(false);
                  setForm((f) => ({ ...f, clientId: "", propertyId: "" }));
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  creatingClient ? "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5" : "bg-navy-900 text-white dark:bg-white/10"
                }`}
              >
                Select existing
              </button>
            </div>
          )}

          {!creatingClient ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-stretch gap-2">
                <select
                  className="input min-w-0 flex-1"
                  value={form.clientId}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      clientId: e.target.value,
                      propertyId: "",
                    }));
                    setAddingProperty(false);
                    setNewProperty({ label: "", postcode: "" });
                  }}
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` · ${c.company}` : ""}
                    </option>
                  ))}
                </select>
                {form.clientId && (
                  <button
                    type="button"
                    onClick={() => setEditClientOpen(true)}
                    className="btn-outline shrink-0 px-3 py-2.5 text-xs"
                    title="View/edit this client's full details"
                  >
                    <FiEdit2 />
                  </button>
                )}
              </div>
              <div>
                {!addingProperty ? (
                  <div className="flex items-stretch gap-2">
                    <select
                      className="input min-w-0 flex-1"
                      value={form.propertyId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, propertyId: e.target.value }))
                      }
                      disabled={!properties.length}
                    >
                      <option value="">
                        {properties.length ? "Select property…" : "No properties on file"}
                      </option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.postcode}
                        </option>
                      ))}
                    </select>
                    {form.clientId && (
                      <button
                        type="button"
                        onClick={() => setAddingProperty(true)}
                        className="btn-outline shrink-0 whitespace-nowrap px-3 py-2.5 text-xs"
                      >
                        + Add property
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-brand-700">
                        New property for this client
                        <span className="ml-1.5 font-normal text-navy-500">— address or postcode, either is enough</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => { setAddingProperty(false); setNewProperty({ label: "", postcode: "" }); }}
                        className="text-xs text-navy-400 hover:text-navy-600"
                      >
                        Cancel
                      </button>
                    </div>
                    <input
                      className="input h-9 text-sm"
                      placeholder="Property address / label"
                      value={newProperty.label}
                      onChange={(e) => setNewProperty((p) => ({ ...p, label: e.target.value }))}
                      autoFocus
                    />
                    <PostcodeInput
                      className="input h-9 text-sm"
                      placeholder="Postcode (fine on its own at quote stage)"
                      value={newProperty.postcode}
                      onChange={(v) => setNewProperty((p) => ({ ...p, postcode: v }))}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <p className="text-xs font-semibold text-brand-700">
                New client — saved to Clients when you create the job
              </p>
              {/* Duplicate guard. This screen now opens on "Add new client",
                  so without a check the same landlord gets re-created on every
                  repeat job — which is exactly how two "Mr Jaswinder Thandi"
                  records appeared. Matches on email or phone (exact, after
                  normalising) or an identical name. */}
              {possibleDuplicate && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                  <p className="text-xs font-semibold text-amber-800">
                    {possibleDuplicate.name} is already on file
                    {possibleDuplicate.matchedOn ? ` — same ${possibleDuplicate.matchedOn}` : ""}.
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    Use the existing record so this job joins their history. You can still add a new property to it.
                  </p>
                  <button
                    type="button"
                    className="btn-outline mt-2 py-1.5 text-xs"
                    onClick={() => {
                      setCreatingClient(false);
                      setForm((f) => ({ ...f, clientId: possibleDuplicate.id, propertyId: "" }));
                    }}
                  >
                    Use {possibleDuplicate.name} instead
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="Client name *"
                  value={newClient.name}
                  onChange={(e) =>
                    setNewClient((c) => ({ ...c, name: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Phone"
                  value={newClient.phone}
                  onChange={(e) =>
                    setNewClient((c) => ({ ...c, phone: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={newClient.email}
                  onChange={(e) =>
                    setNewClient((c) => ({ ...c, email: e.target.value }))
                  }
                />
                <PostcodeInput
                  placeholder="Property postcode"
                  value={newClient.postcode}
                  onChange={(v) => setNewClient((c) => ({ ...c, postcode: v }))}
                />
              </div>
              <input
                className="input"
                placeholder="Property address / label"
                value={newClient.propertyLabel}
                onChange={(e) =>
                  setNewClient((c) => ({ ...c, propertyLabel: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        {/* Services */}
        <div>
          <label className="label">Services</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {catalog.map((s) => {
              const count = form.lines.filter((l) => l.code === s.code).length;
              const on = count > 0;
              return (
                <button
                  type="button"
                  key={s.code}
                  onClick={() => addServiceLine(s.code)}
                  title={on ? "Add another line for this service (e.g. a second property)" : undefined}
                  className={`flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                    on
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                  }`}
                >
                  <span>{s.name}</span>
                  {count > 1 && (
                    <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      ×{count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editable breakdown: steppers + editable price per line + custom services */}
        <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-label text-xs">
              Breakdown
            </p>
            <p className="text-[11px] text-navy-400">prices editable</p>
          </div>

          {form.lines.length === 0 ? (
            <p className="py-2 text-center text-xs text-navy-400">
              Pick a service above, or add a custom one below.
            </p>
          ) : (
            <ul className="divide-y divide-navy-100">
              {form.lines.map((l) => {
                const isGas = l.code === "GAS";
                const isCustom = l.code === "CUSTOM";
                const qty = l.qty || 1;
                const cat = catalog.find((c) => c.code === l.code);
                const tiers = cat?.tiers;
                const isAddon = cat?.addon;
                return (
                  <li key={l.id} className="py-2">
                    <div className="flex flex-col gap-2 max-sm:items-stretch sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      {isCustom ? (
                        <input
                          className="input h-8 w-full text-sm font-medium"
                          value={l.name}
                          placeholder="Service name"
                          onChange={(e) => updateLine(l.id, { name: e.target.value })}
                        />
                      ) : (
                        <p className="truncate text-sm font-medium text-navy-800">
                          {l.name}
                        </p>
                      )}
                      {tiers ? (
                        <select
                          className="input mt-1 h-7 w-full py-0 text-xs"
                          value={l.tier || tiers[0].label}
                          onChange={(e) => setLineTier(l.id, e.target.value)}
                        >
                          {tiers.map((t) => (
                            <option key={t.label} value={t.label}>
                              {t.label} · {gbp(t.price)}
                            </option>
                          ))}
                        </select>
                      ) : isAddon ? (
                        <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-navy-600">
                          <input
                            type="checkbox"
                            checked={!!l.waived}
                            onChange={(e) => updateLine(l.id, { waived: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
                          />
                          {l.waived
                            ? "Discounted — shown as waived on the invoice"
                            : "Waive this charge (kept on invoice, marked discounted)"}
                        </label>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-navy-500">
                          {isGas
                            ? `${qty} appliance${qty > 1 ? "s" : ""} · £60 first, +£10 each`
                            : isCustom
                            ? "custom service"
                            : `${gbp(l.unit)} each`}
                        </p>
                      )}
                      {/* Guidance for tiers whose label alone doesn't say
                          when to pick them — the residential and commercial
                          FRAs both offer a "communal areas" tier at different
                          prices, and nothing on screen said which was which. */}
                      {tiers && (() => {
                        const sel = tiers.find((x) => x.label === (l.tier || tiers[0].label));
                        return sel?.hint ? (
                          <p className="mt-1 text-[10.5px] leading-snug text-navy-500">{sel.hint}</p>
                        ) : null;
                      })()}
                      {/* "1–3 Bedrooms" is one customer-facing price band, but
                          some engineers (e.g. Prime Electric) are paid a
                          different amount per exact bedroom count within it.
                          This never changes what the client is quoted — it
                          only feeds the engineer-pay lookup in lib/finance.js,
                          and only matters at all for an engineer who actually
                          has bedroom-specific rates configured; everyone else
                          keeps using the tier price exactly as before. */}
                      {/* Any service priced with a "1–3 Bedrooms" band, not
                          just EICR — EPC and Fire Risk Assessment use the
                          same band and had no way to record the real size. */}
                      {(l.tier || tiers?.[0]?.label) === "1–3 Bedrooms" && (
                        <select
                          className="input mt-1 h-7 w-full py-0 text-xs"
                          value={l.bedroomCount || ""}
                          onChange={(e) => updateLine(l.id, { bedroomCount: e.target.value ? Number(e.target.value) : undefined })}
                          title="Exact bedroom count — affects engineer pay only, not the customer price"
                        >
                          <option value="">Exact bedrooms for pay (optional)…</option>
                          <option value="1">1 Bedroom</option>
                          <option value="2">2 Bedrooms</option>
                          <option value="3">3 Bedrooms</option>
                        </select>
                      )}
                    </div>

                    {/* qty stepper + price — row on sm+, stacked on narrow screens */}
                    <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        className="grid h-7 w-7 place-items-center rounded-md border border-navy-200 bg-white text-navy-700 hover:bg-navy-100"
                        onClick={() => setLineQty(l.id, qty - 1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        className="input h-8 w-11 px-1 text-center"
                        value={qty}
                        onChange={(e) => setLineQty(l.id, e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        className="grid h-7 w-7 place-items-center rounded-md border border-navy-200 bg-white text-navy-700 hover:bg-navy-100"
                        onClick={() => setLineQty(l.id, qty + 1)}
                      >
                        +
                      </button>
                    </div>

                    {/* editable line price (inc VAT) */}
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-navy-400">
                        £
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={l.waived}
                        className={`input h-8 w-24 pl-5 pr-1 text-right text-sm font-semibold ${
                          l.waived ? "text-navy-400 line-through" : ""
                        }`}
                        value={(l.waived ? lineGross(l) : lineTotal(l)).toFixed(2)}
                        onChange={(e) => setLineTotal(l.id, e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      aria-label="Remove line"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-navy-400 hover:bg-rose-50 hover:text-rose-500"
                      onClick={() => removeLine(l.id)}
                    >
                      <FiTrash2 className="h-3.5 w-3.5" />
                    </button>
                    </div>
                    </div>

                    {/* Per-service engineer (only when there are 2+ lines) */}
                    {form.lines.length > 1 && (
                      <div className="mt-1.5 flex items-center gap-2 pl-1">
                        <span className="text-[11px] text-navy-400">Assign to</span>
                        <select
                          className="input h-7 flex-1 py-0 text-xs"
                          value={l.engineerId || ""}
                          onChange={(e) =>
                            updateLine(l.id, { engineerId: e.target.value || undefined })
                          }
                        >
                          <option value="">Same as job engineer</option>
                          {qualifiedFor(new Set([l.code])).map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                              {e.trade ? ` · ${e.trade}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Per-service notes. Job-level notes go to EVERY engineer
                        on the job, so on a split job the gas engineer was
                        reading the EICR instructions and vice versa. Anything
                        typed here appears ONLY on the card for whoever is
                        doing this line. */}
                    {/* Goodwill / multi-service discount. Was only available
                        as a waive on parking, so a £10 off an EICR had to be
                        faked by editing the price — which then looked like the
                        real price on the quote. This keeps the true price and
                        shows the reduction. */}
                    <div className="mt-1.5 flex items-center gap-2 pl-1">
                      <span className="shrink-0 text-[11px] text-navy-400">Discount £</span>
                      <input
                        type="number" step="0.01" min="0"
                        className="input h-7 w-24 py-0 text-xs"
                        placeholder="0.00"
                        value={l.discount ?? ""}
                        onChange={(e) => updateLine(l.id, { discount: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                      {Number(l.discount) > 0 && (
                        <span className="text-[11px] text-brand-600">
                          {gbp(lineGross(l))} → {gbp(lineTotal(l))}
                        </span>
                      )}
                    </div>

                    {form.lines.length > 1 && (
                      <div className="mt-1.5 flex items-start gap-2 pl-1">
                        <span className="mt-1.5 shrink-0 text-[11px] text-navy-400">Notes</span>
                        <input
                          className="input h-7 flex-1 py-0 text-xs"
                          placeholder="Only shown on this engineer's card — e.g. meter in basement, key from flat 2"
                          value={l.notes || ""}
                          onChange={(e) => updateLine(l.id, { notes: e.target.value })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add a custom / one-off service */}
          <div className="mt-2 flex items-center gap-2 border-t border-navy-200 pt-2">
            <input
              className="input h-8 flex-1 text-sm"
              placeholder="Add custom service (e.g. Legionella Risk Assessment)"
              value={custom.name}
              onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomLine();
                }
              }}
            />
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-navy-400">
                £
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input h-8 w-24 pl-5 pr-1 text-right text-sm"
                placeholder="0.00"
                value={custom.price}
                onChange={(e) => setCustom((c) => ({ ...c, price: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomLine();
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={addCustomLine}
              disabled={!custom.name.trim()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-brand-300 bg-brand-50 text-brand-600 hover:bg-brand-100 disabled:opacity-40"
              aria-label="Add custom service"
            >
              <FiPlus />
            </button>
          </div>

          {/* Whole-job discount, with a REASON. The per-line discounts above
              price one service differently; this is the "£20 off if you take
              all three" agreed on the phone. Naming it is the point — an
              untyped discount can't be counted, so "how much did we give away
              on referrals" becomes unanswerable. Same four reasons the
              quote/invoice builder offers, from lib/constants. */}
          <div className="mt-2 border-t border-navy-200 pt-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-navy-600" htmlFor="job-discount">
                Discount off the job
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-navy-500">£</span>
                <input
                  id="job-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={linesSubtotal || undefined}
                  placeholder="0.00"
                  className="input h-8 w-24 text-right text-sm"
                  value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DISCOUNT_PRESETS.map((label) => {
                const on = form.discountReason === label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, discountReason: on ? "" : label }))
                    }
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      on
                        ? "border-rose-400 bg-rose-500 text-white"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300"
                    }`}
                  >
                    − {label.replace(" Discount", "")}
                  </button>
                );
              })}
            </div>
            {jobDiscountAmt > 0 && !form.discountReason && (
              <p className="mt-1 text-[11px] text-amber-700">
                Pick a reason so this discount can be reported on — it saves as
                &ldquo;Discount&rdquo; otherwise.
              </p>
            )}
          </div>

          {jobDiscountAmt > 0 && (
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-navy-500">Subtotal</span>
              <span className="tnum text-navy-500 line-through">{gbp(linesSubtotal)}</span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-navy-200 pt-2">
            <span className="text-sm font-semibold text-navy-600">
              Total
            </span>
            <span className="text-base font-bold text-brand-600">
              {gbp(breakdownTotal)}
            </span>
          </div>
        </div>

        {/* Status + engineer */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {statusMeta(s).label}
                </option>
              ))}
            </select>
            {needsCancelReason && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <label className="label text-rose-800">Reason for cancelling (required)</label>
                <select
                  className="input mt-1"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                >
                  <option value="">Pick a reason…</option>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
                <textarea
                  className="input mt-2 min-h-[60px] text-sm"
                  placeholder={
                    CANCEL_REASONS.find((r) => r.key === cancelReason)?.requiresNote
                      ? "Say what happened (required)"
                      : "Notes (optional)"
                  }
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                />
              </div>
            )}
          </div>
          <div>
            <label className="label">Engineer</label>
            <select
              className="input"
              value={form.engineerId}
              onChange={(e) =>
                setForm((f) => ({ ...f, engineerId: e.target.value }))
              }
            >
              {engineerOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.trade ? ` · ${e.trade}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Name on certificate */}
        <div>
          <label className="label">Name on certificate</label>
          <input
            className="input"
            value={form.nameOnCert}
            placeholder={client ? `Defaults to ${client.name}` : "Who the cert is issued to"}
            onChange={(e) =>
              setForm((f) => ({ ...f, nameOnCert: e.target.value }))
            }
          />
        </div>

        {/* Access contact (tenant / whoever lets the engineer in) */}
        <div>
          <label className="label">Access contacts (if not the client)</label>
          {/* A list, not one pair. Properties routinely have two tenants, or a
              tenant plus a neighbour with the key — the second contact used to
              end up buried in the notes where the job card never showed it. */}
          <div className="space-y-2">
            {(form.accessContacts || []).map((c, i) => (
              <div key={i} className="flex items-stretch gap-2">
                <input
                  className="input min-w-0 flex-1"
                  placeholder={i === 0 ? "Name (e.g. tenant)" : "Another name"}
                  value={c.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      accessContacts: f.accessContacts.map((x, xi) =>
                        xi === i ? { ...x, name: e.target.value } : x
                      ),
                    }))
                  }
                />
                <input
                  className="input min-w-0 flex-1"
                  placeholder={
                    i === 0 && client?.phone ? `Phone — defaults to ${client.phone}` : "Phone"
                  }
                  value={c.phone}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      accessContacts: f.accessContacts.map((x, xi) =>
                        xi === i ? { ...x, phone: e.target.value } : x
                      ),
                    }))
                  }
                />
                {form.accessContacts.length > 1 && (
                  <button
                    type="button"
                    className="btn-outline shrink-0 px-3 py-2.5 text-xs"
                    title="Remove this contact"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        accessContacts: f.accessContacts.filter((_, xi) => xi !== i),
                      }))
                    }
                  >
                    <FiTrash2 />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-outline mt-2 py-1.5 text-xs"
            onClick={() =>
              setForm((f) => ({ ...f, accessContacts: [...(f.accessContacts || []), { name: "", phone: "" }] }))
            }
          >
            <FiPlus /> Add another contact
          </button>
          <p className="mt-1 text-[11px] text-navy-400">
            All of these appear on the engineer&apos;s assigned card. Leave blank to use the client&apos;s own number.
          </p>
        </div>

        {/* Arrival date + window + expected duration */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Arrival date</label>
            <input
              type="date"
              className="input"
              value={form.scheduledDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, scheduledDate: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">Part of day</label>
            <select
              className="input"
              value={form.windowPart}
              onChange={(e) => setWindowPart(e.target.value)}
            >
              <option value="">—</option>
              {TIME_PARTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label">Time window</label>
            {/* min-w-0 on the flex row AND each input — without it, flex
                items default to min-width:auto and refuse to shrink below
                their native content size, so the pair pushes past this
                narrow grid column and spills off the right edge of the
                modal instead of actually fitting inside it. */}
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                type="time"
                className="input min-w-0 flex-1 px-1.5 text-center"
                value={form.windowFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, windowFrom: e.target.value }))
                }
              />
              <span className="shrink-0 text-navy-400">–</span>
              <input
                type="time"
                className="input min-w-0 flex-1 px-1.5 text-center"
                value={form.windowTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, windowTo: e.target.value }))
                }
              />
            </div>
          </div>
          {/* Full width on phones and two columns from `sm` up.
              The duration picker is three segments that SEPARATE when you
              tap them — its width is part of how it works, and it cannot
              usefully shrink to a quarter-column. Given one of four narrow
              tracks it simply overflowed, and the confirm button hung off
              the right edge of the modal. It gets the room it needs
              instead of being squeezed and breaking the layout. */}
          <div className="min-w-0 sm:col-span-2">
            <label className="label">Expected duration</label>
            <DurationPicker
              className="mt-1"
              maxHours={12}
              maxMinutes={59}
              value={{
                hours: Math.floor((Number(form.durationMinutes) || 0) / 60),
                minutes: (Number(form.durationMinutes) || 0) % 60,
              }}
              onChange={({ hours, minutes }) =>
                setForm((f) => ({ ...f, durationMinutes: hours * 60 + minutes }))
              }
            />
            <p className="mt-1 text-[11px] text-navy-400">
              How long the visit takes — separate from the arrival window.
            </p>
          </div>
        </div>

        {conflictWith && (
          <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            <FiAlertTriangle className="shrink-0" />
            {conflictEngineerName || "This engineer"} already has {conflictWith.id} booked in an overlapping window that day.
          </p>
        )}

        {/* Call instruction + price */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Call before (engineer)</label>
            <select
              className="input"
              value={form.callBefore}
              onChange={(e) =>
                setForm((f) => ({ ...f, callBefore: e.target.value }))
              }
            >
              <option value="">No call instruction</option>
              {CALL_BEFORE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.price}
              onChange={(e) => {
                setPriceTouched(true);
                setForm((f) => ({ ...f, price: e.target.value }));
              }}
            />
            {/* Once the price is manually edited once, it stops auto-syncing
                with the line-item breakdown for the rest of this session —
                by design, so a deliberate override sticks. But that means a
                LATER, unrelated line-item edit (bumping a quantity, adding a
                service) silently leaves the headline price stale with no
                indication anything's wrong — exactly what happened on a real
                job where the breakdown read £389.97 but Price/Financials
                still showed £117.99 from an earlier edit. Surface the
                mismatch instead of letting it drift silently. */}
            {priceTouched && Math.abs((Number(form.price) || 0) - breakdownTotal) > 0.01 && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, price: breakdownTotal }))}
                className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-200"
              >
                <FiAlertTriangle className="shrink-0" />
                Doesn&rsquo;t match the {gbp(breakdownTotal)} line-item total — click to sync
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={form.notes}
            placeholder="Access details, tenant info, special requirements…"
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmDiscard}
      title={isEdit ? "Discard your changes?" : "Discard this job?"}
      body={isEdit
        ? "The edits you've made won't be saved."
        : "The details you've entered won't be saved."}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onCancel={() => setConfirmDiscard(false)}
      onConfirm={() => { setConfirmDiscard(false); onClose(); }}
    />
    <ConfirmDialog
      open={!!quoteChanges}
      title={`Change the quote for ${job?.id || "this job"}?`}
      body={quoteChanges && (
        <>
          {(quoteChanges || []).map((c, i) => <span key={i} className="block font-medium text-navy-800">• {c}</span>)}
          <span className="block mt-2">
            {job?.acceptedAt
              ? "The client has already accepted this quote. Only change it if they've agreed — and send them the corrected quote."
              : job?.quoteSentAt
              ? "This quote has already been sent. The client will need the corrected one."
              : "Check this is the right job before saving."}
          </span>
        </>
      )}
      confirmLabel="Yes, change it"
      cancelLabel="Go back"
      onCancel={() => setQuoteChanges(null)}
      onConfirm={() => { setQuoteChanges(null); doSave(); }}
    />
    <ClientModal
      open={editClientOpen}
      onClose={() => setEditClientOpen(false)}
      client={client}
    />
    </>
  );
}
