"use client";

// AgentModal — add or edit a letting agent (handoff doc §4.3).
// Pre-fills from `agent` prop if editing; otherwise creates a fresh record.

import { useEffect, useState, useRef } from "react";
import Modal from "./Modal";
import { makeAgent } from "@/lib/agents";
import { toast } from "@/lib/toast";

const EMPTY = {
  agency_name: "", contact_name: "", email: "", phone: "", address: "",
  area: "", portfolio_size: "", decision_maker_role: "", notes: "",
  agreement_signed: false,
};

export default function AgentModal({ open, onClose, agent, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const initRef = useRef(null);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = agent ? `agent-${agent.id}` : `new`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    if (agent) {
      setForm({
        ...EMPTY,
        agency_name: agent.agency_name || "",
        contact_name: agent.contact_name || "",
        email: agent.email || "",
        phone: agent.phone || "",
        address: agent.address || "",
        area: (agent.area_focus || []).join(", "),
        portfolio_size: agent.portfolio_size || "",
        decision_maker_role: agent.decision_maker_role || "",
        notes: agent.notes || "",
        agreement_signed: !!agent.agreement_signed,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, agent]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = () => {
    if (!form.agency_name.trim()) { toast.error("Agency name is required"); return; }
    const built = makeAgent({
      ...(agent || {}),
      ...form,
      portfolio_size: Number(form.portfolio_size) || 0,
      area: form.area,
    });
    onSave(built);
  };

  return (
    <Modal open={open} onClose={onClose} title={agent ? "Edit letting agent" : "Add letting agent"}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>{agent ? "Save" : "Add agent"}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Agency name *</label>
          <input className="input" value={form.agency_name} onChange={set("agency_name")} placeholder="e.g. Camden Lets Ltd" /></div>
        <div><label className="label">Contact name</label>
          <input className="input" value={form.contact_name} onChange={set("contact_name")} placeholder="e.g. Sarah Patel" /></div>
        <div><label className="label">Decision-maker role</label>
          <input className="input" value={form.decision_maker_role} onChange={set("decision_maker_role")} placeholder="e.g. Lettings Manager" /></div>
        <div><label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={set("phone")} placeholder="07xxx xxxxxx" /></div>
        <div><label className="label">Email</label>
          <input className="input" value={form.email} onChange={set("email")} placeholder="ops@agency.com" /></div>
        <div className="col-span-2"><label className="label">Office address</label>
          <input className="input" value={form.address} onChange={set("address")} placeholder="Office address" /></div>
        <div><label className="label">Area focus</label>
          <input className="input" value={form.area} onChange={set("area")} placeholder="e.g. Camden, Islington" /></div>
        <div><label className="label">Portfolio size</label>
          <input type="number" min="0" className="input" value={form.portfolio_size} onChange={set("portfolio_size")} placeholder="e.g. 25" /></div>
        <div className="col-span-2"><label className="label">Notes</label>
          <textarea className="input min-h-20" value={form.notes} onChange={set("notes")} placeholder="Anything to remember…" /></div>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.agreement_signed} onChange={set("agreement_signed")} />
          Trade agreement signed (5% discount in place)
        </label>
      </div>
    </Modal>
  );
}
