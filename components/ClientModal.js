"use client";

import { useState, useEffect, useRef } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { CONTACT_METHODS, CLIENT_TAGS, CONTACT_ROLES } from "@/lib/clients";
import PostcodeInput from "./PostcodeInput";
import { formatPostcode } from "@/lib/enquiry";

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  type: "Landlord",
  notes: "",
  properties: [],
  preferredContact: "",
  discountPercent: "",
  billingName: "",
  billingEmail: "",
  billingAddress: "",
  tags: [],
  contacts: [],
  preferredEngineerId: "",
};

const TYPES = ["Landlord", "Managing agent", "Commercial", "Housing association"];

export default function ClientModal({ open, onClose, client }) {
  const { addClient, updateClient, engineers } = useStore();
  const [form, setForm] = useState(emptyForm);
  const isEdit = Boolean(client);
  const initRef = useRef(null);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = client ? `client-${client.id}` : `new`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    if (client) {
      setForm({
        name: client.name || "",
        company: client.company || "",
        email: client.email || "",
        phone: client.phone || "",
        type: client.type || "Landlord",
        notes: client.notes || "",
        properties: client.properties ? [...client.properties] : [],
        preferredContact: client.preferredContact || "",
        discountPercent: client.discountPercent != null && client.discountPercent !== "" ? String(client.discountPercent) : "",
        billingName: client.billingName || "",
        billingEmail: client.billingEmail || "",
        billingAddress: client.billingAddress || "",
        tags: Array.isArray(client.tags) ? client.tags : [],
        contacts: Array.isArray(client.contacts) ? client.contacts : [],
        preferredEngineerId: client.preferredEngineerId || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, client]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addProperty = () =>
    setForm((f) => ({
      ...f,
      properties: [
        ...f.properties,
        { id: "pr-" + Date.now().toString(36), label: "", postcode: "", area: "", beds: 0 },
      ],
    }));

  const updateProperty = (id, key, value) =>
    setForm((f) => ({
      ...f,
      properties: f.properties.map((p) =>
        p.id === id ? { ...p, [key]: value } : p
      ),
    }));

  // Tidy the postcode ("sw1a1aa" → "SW1A 1AA"), check it really exists and
  // fill in the borough. A mistyped postcode is how an engineer ends up at
  // the wrong door. (postcodes.io — the postcode only is sent.)
  const checkPostcode = async (id, raw) => {
    const pc = formatPostcode(raw);
    if (!pc || pc.replace(/\s/g, "").length < 5) return;
    updateProperty(id, "postcode", pc);
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      if (r.status === 404) { updateProperty(id, "postcodeOk", false); return; }
      const d = await r.json();
      updateProperty(id, "postcodeOk", true);
      if (d?.result?.admin_district) updateProperty(id, "area", d.result.admin_district);
    } catch {}
  };

  const removeProperty = (id) =>
    setForm((f) => ({
      ...f,
      properties: f.properties.filter((p) => p.id !== id),
    }));

  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      ...form,
      discountPercent: Math.max(0, Math.min(100, Number(form.discountPercent) || 0)) || "",
      contacts: (form.contacts || []).filter((c) => (c.name || "").trim() || (c.phone || "").trim() || (c.email || "").trim()),
      // Keep a property if it has EITHER an address or a postcode. Filtering
      // on the label alone silently deleted postcode-only rows on save —
      // which at quote stage is often all the client has given us. Only a
      // genuinely blank row gets dropped.
      properties: form.properties.filter(
        (p) => (p.label || "").trim() || (p.postcode || "").trim()
      ),
    };
    if (isEdit) updateClient(client.id, payload);
    else addClient(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={isEdit ? `Edit ${client.name}` : "New client"}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Save changes" : "Create client"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={set("name")} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="label">Company</label>
            <input className="input" value={form.company} onChange={set("company")} placeholder="Smith Lettings" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={set("email")} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set("phone")} placeholder="07700 900000" />
          </div>
        </div>
        <div>
          <label className="label">Client type</label>
          <select className="input" value={form.type} onChange={set("type")}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Prefers to be contacted by</label>
            <select className="input" value={form.preferredContact} onChange={set("preferredContact")}>
              <option value="">No preference</option>
              {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Portfolio discount %</label>
            <input className="input" type="number" min="0" max="100" step="0.5" value={form.discountPercent} onChange={set("discountPercent")} placeholder="0" />
          </div>
        </div>

        <div>
          <label className="label">Usual engineer</label>
          <select className="input" value={form.preferredEngineerId} onChange={set("preferredEngineerId")}>
            <option value="">No preference</option>
            {(engineers || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_TAGS.map((t) => {
              const on = (form.tags || []).includes(t);
              return (
                <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, tags: on ? f.tags.filter((x) => x !== t) : [...(f.tags || []), t] }))} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{t}</button>
              );
            })}
          </div>
        </div>

        <details className="rounded-lg border border-navy-100 p-3" open={(form.contacts || []).length > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-navy-700">Other contacts ({(form.contacts || []).length})</summary>
          <p className="mt-1 text-xs text-navy-500">The agent, the accounts department, a tenant — anyone else you deal with for this client.</p>
          <div className="mt-2 space-y-2">
            {(form.contacts || []).map((c) => {
              const patch = (p) => setForm((f) => ({ ...f, contacts: f.contacts.map((x) => (x.id === c.id ? { ...x, ...p } : x)) }));
              return (
                <div key={c.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr,0.9fr,1fr,1.3fr,auto]">
                  <input className="input" placeholder="Name" value={c.name || ""} onChange={(e) => patch({ name: e.target.value })} />
                  <select className="input" value={c.role || ""} onChange={(e) => patch({ role: e.target.value })}>
                    <option value="">Role</option>
                    {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input className="input" placeholder="Phone" value={c.phone || ""} onChange={(e) => patch({ phone: e.target.value })} />
                  <input className="input" placeholder="Email" value={c.email || ""} onChange={(e) => patch({ email: e.target.value })} />
                  <button type="button" className="rounded-lg border border-navy-200 px-2 text-rose-500 hover:bg-rose-50" aria-label="Remove contact" onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((x) => x.id !== c.id) }))}><FiTrash2 /></button>
                </div>
              );
            })}
            <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setForm((f) => ({ ...f, contacts: [...(f.contacts || []), { id: "ct-" + Date.now().toString(36), name: "", role: "", phone: "", email: "" }] }))}>+ Add a contact</button>
          </div>
        </details>

        {/* Who pays — an agent often books for a landlord, and the invoice
            has to be made out to whoever is actually paying it. */}
        <details className="rounded-lg border border-navy-100 p-3" open={Boolean(form.billingName || form.billingEmail || form.billingAddress)}>
          <summary className="cursor-pointer text-sm font-semibold text-navy-700">Invoices go to someone else</summary>
          <p className="mt-1 text-xs text-navy-500">Leave blank if this client pays their own invoices.</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Name on the invoice" value={form.billingName} onChange={set("billingName")} />
            <input className="input" placeholder="Email for invoices" value={form.billingEmail} onChange={set("billingEmail")} />
            <input className="input sm:col-span-2" placeholder="Billing address" value={form.billingAddress} onChange={set("billingAddress")} />
          </div>
        </details>

        {/* Properties */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">Properties</label>
            <button
              type="button"
              onClick={addProperty}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              <FiPlus /> Add property
            </button>
          </div>
          <div className="space-y-2">
            {form.properties.length === 0 && (
              <p className="rounded-lg border border-dashed border-navy-200 px-3 py-3 text-center text-xs text-navy-400">
                No properties yet.
              </p>
            )}
            {form.properties.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-navy-100 bg-navy-50/50 p-2 sm:grid-cols-[1fr,110px,40px]"
              >
                <input
                  className="input"
                  placeholder="Address / label"
                  value={p.label}
                  onChange={(e) => updateProperty(p.id, "label", e.target.value)}
                />
                <PostcodeInput
                  value={p.postcode || ""}
                  onChange={(v) => updateProperty(p.id, "postcode", v)}
                  onPick={(v) => checkPostcode(p.id, v)}
                  onBlur={(e) => checkPostcode(p.id, e.target.value)}
                  title={p.postcodeOk === false ? "That postcode wasn't found — check it" : undefined}
                  style={p.postcodeOk === false ? { borderColor: "#e11d48" } : undefined}
                />
                <button
                  type="button"
                  onClick={() => removeProperty(p.id)}
                  className="grid place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50"
                  aria-label="Remove property"
                >
                  <FiTrash2 />
                </button>
                <input
                  className="input sm:col-span-3"
                  placeholder="Access notes — keys, door code, parking, who lets you in"
                  value={p.accessNotes || ""}
                  onChange={(e) => updateProperty(p.id, "accessNotes", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={form.notes}
            onChange={set("notes")}
            placeholder="Preferences, access notes, portfolio size…"
          />
        </div>
      </div>
    </Modal>
  );
}
