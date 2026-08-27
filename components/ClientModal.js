"use client";

import { useState, useEffect, useRef } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import Modal from "./Modal";
import { useStore } from "@/lib/store";

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  type: "Landlord",
  notes: "",
  properties: [],
};

const TYPES = ["Landlord", "Managing agent", "Commercial", "Housing association"];

export default function ClientModal({ open, onClose, client }) {
  const { addClient, updateClient } = useStore();
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
                <input
                  className="input"
                  placeholder="Postcode"
                  value={p.postcode}
                  onChange={(e) => updateProperty(p.id, "postcode", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeProperty(p.id)}
                  className="grid place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50"
                  aria-label="Remove property"
                >
                  <FiTrash2 />
                </button>
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
