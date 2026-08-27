"use client";

// EngineerRecruitsTab — Sourcing Pipeline kanban for engineer candidates.
// Built on PipelineKanban (drag-to-stage). Stages 1–3 (sourced / contacted /
// agreement_sent) are agent-owned; stage 4 (agreement_signed) flags the
// founder; stages 5–7 are founder-owned. On `onboarded` we promote into the
// active engineers table.

import { useMemo, useRef, useState } from "react";
import {
  FiUpload, FiUserPlus, FiTrash2, FiX, FiCheckCircle, FiPhone, FiMail,
} from "react-icons/fi";
import Modal from "./Modal";
import PipelineKanban from "./PipelineKanban";
import DetailSlideOver from "./DetailSlideOver";
import StageBadge from "./StageBadge";
import OutreachToolbar from "./OutreachToolbar";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { STAGES, makeRecruit } from "@/lib/engineer-recruits";
import { recruitsFromCSVWithStats } from "@/lib/engineer-recruits-csv";
import { useConfirm } from "@/components/ConfirmProvider";

const STAGE_COLORS = {
  sourced: "bg-slate-400", contacted: "bg-blue-500",
  agreement_sent: "bg-blue-600", agreement_signed: "bg-amber-500",
  rate_card_set: "bg-purple-500", meeting_scheduled: "bg-purple-600",
  onboarded: "bg-emerald-600",
};

export default function EngineerRecruitsTab() {
  const ask = useConfirm();
  const {
    recruits, importRecruits, upsertRecruit, updateRecruit, logRecruitContact,
    removeRecruit, clearRecruits, addEngineer,
  } = useStore();
  const [active, setActive] = useState(null);
  const [adding, setAdding] = useState(false);
  const [lastBatch, setLastBatch] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("lcl-recruits-last-batch") || "null"); } catch { return null; }
  });
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const batchId = `b-${Date.now().toString(36)}`;
        const { recruits: parsed, stats } = recruitsFromCSVWithStats(ev.target.result, { source: file.name, importBatchId: batchId });
        if (!parsed.length) { toast.error("No valid rows"); return; }
        const { added, skipped } = importRecruits(parsed);
        const stamp = { batchId, count: added, filename: file.name, at: Date.now() };
        setLastBatch(stamp);
        try { localStorage.setItem("lcl-recruits-last-batch", JSON.stringify(stamp)); } catch {}
        toast.success(`Imported ${added} recruits${skipped ? ` · ${skipped} already existed` : ""}`);
        setTimeout(() => alert(`CSV row breakdown\n\nTotal rows: ${stats.totalRows}\nImported: ${added}\nAlready in DB: ${skipped}\nDuplicates inside CSV: ${stats.dupInCsv}\nDropped (no name): ${stats.noName}`), 100);
      } catch (err) { toast.error("Could not parse CSV: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const undoLast = async () => {
    if (!lastBatch?.batchId) return;
    const toRemove = recruits.filter((r) => r.importBatchId === lastBatch.batchId).map((r) => r.id);
    if (!toRemove.length) { toast.error("Those rows aren't in the database"); setLastBatch(null); return; }
    if (!await ask(`Remove ${toRemove.length} recruits from "${lastBatch.filename}"?`)) return;
    clearRecruits(toRemove);
    setLastBatch(null);
    try { localStorage.removeItem("lcl-recruits-last-batch"); } catch {}
    toast.success(`Removed ${toRemove.length} recruits`);
  };

  const move = (id, newStage) => {
    updateRecruit(id, { stage: newStage });
    if (newStage === "onboarded") {
      const r = recruits.find((x) => x.id === id);
      if (r) promoteToActive(r);
    }
  };

  const promoteToActive = (r) => {
    // Build an Engineer record from the recruit and add it to the live roster.
    const newEng = {
      id: "eng-" + Date.now().toString(36),
      name: r.contact?.name || "",
      trade: r.trade?.join(" / ") || "",
      type: "Individual",
      company: "",
      phone: r.contact?.phone || "",
      email: r.contact?.email || "",
      postcode: r.area || "",
      areas: r.area || "",
      services: r.services_offered || [],
      cutPercent: 40,
      color: "#3fa34d",
      notes: `Promoted from sourcing pipeline · ${r.source || "manual"}`,
    };
    addEngineer(newEng);
    toast.success(`${newEng.name} promoted to active roster`);
  };

  const stages = useMemo(() =>
    STAGES.map((s) => ({ ...s, color: STAGE_COLORS[s.key] }))
  , []);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-secondary flex items-center gap-2" onClick={() => setAdding(true)}>
          <FiUserPlus /> Add recruit
        </button>
        {lastBatch?.batchId && (
          <button className="btn-secondary flex items-center gap-2" onClick={undoLast}
            title={`Undo "${lastBatch.filename}"`}>
            <FiX /> Undo last import
          </button>
        )}
        {recruits.length > 0 && (
          <button className="btn-secondary flex items-center gap-2 text-rose-600" onClick={async () => {
            if (!await ask(`Clear ALL ${recruits.length} recruits?`)) return;
            clearRecruits();
          }}>
            <FiTrash2 /> Clear all
          </button>
        )}
        <label className="btn-primary ml-auto flex cursor-pointer items-center gap-2">
          <FiUpload /> Import CSV
          <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" />
        </label>
      </div>

      {recruits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
          <p className="mb-3 text-sm text-navy-500 dark:text-slate-400">No recruits yet. Add manually or import a CSV.</p>
          <p className="text-[11px] text-navy-400">CSV columns: name, phone, email, trade, services, area, availability, notes</p>
        </div>
      ) : (
        <PipelineKanban
          items={recruits}
          stages={stages}
          onMove={move}
          onCardClick={setActive}
          renderCard={(r) => (
            <div>
              <div className="flex items-center justify-between">
                <div className="truncate text-sm font-semibold text-navy-900 dark:text-slate-100">{r.contact?.name || "—"}</div>
                {STAGES.find((s) => s.key === r.stage)?.owner === "founder" && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">FOUNDER</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-navy-500 dark:text-slate-400">
                {(r.trade || []).join(" / ") || "trade?"}{r.area ? ` · ${r.area}` : ""}
              </div>
              {r.contact?.phone && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-navy-600 dark:text-slate-300">
                  <FiPhone className="h-2.5 w-2.5" /> {r.contact.phone}
                </div>
              )}
            </div>
          )}
        />
      )}

      <RecruitDetail
        recruit={active}
        onClose={() => { if (active) setActive(recruits.find((r) => r.id === active.id) || null); setActive(null); }}
        onUpdate={updateRecruit}
        onLog={logRecruitContact}
        onRemove={(id) => { removeRecruit(id); setActive(null); }}
        onPromote={(r) => { promoteToActive(r); updateRecruit(r.id, { stage: "onboarded" }); setActive(null); }}
      />

      <AddRecruitModal open={adding} onClose={() => setAdding(false)} onSave={(form) => {
        const r = makeRecruit(form);
        upsertRecruit(r);
        setAdding(false);
        toast.success(`Added ${r.contact.name}`);
      }} />
    </div>
  );
}

function RecruitDetail({ recruit, onClose, onUpdate, onLog, onRemove, onPromote }) {
  const ask = useConfirm();
  const [note, setNote] = useState("");
  if (!recruit) return <DetailSlideOver open={false} onClose={onClose} />;
  const r = recruit;
  const log = (channel) => { onLog(r.id, { channel, note: note || undefined, direction: "out" }); setNote(""); };

  return (
    <DetailSlideOver
      open={!!recruit}
      onClose={onClose}
      title={r.contact?.name || "Recruit"}
      subtitle={`${(r.trade || []).join(" / ") || "trade?"}${r.area ? ` · ${r.area}` : ""}`}
      actions={<StageBadge stage={r.stage} />}
      footer={
        <div className="flex items-center gap-2">
          {r.stage !== "onboarded" && (
            <button className="btn-primary flex items-center gap-2" onClick={() => onPromote(r)}>
              <FiCheckCircle /> Promote to active engineer
            </button>
          )}
          <button className="btn-secondary ml-auto text-rose-600" onClick={async () => { if (await ask(`Remove ${r.contact.name}?`)) onRemove(r.id); }}>
            <FiTrash2 /> Remove
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="rounded-xl bg-navy-50 p-4 dark:bg-white/5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Phone" value={r.contact?.phone} />
            <Field label="Email" value={r.contact?.email} />
            <Field label="Trade" value={(r.trade || []).join(" / ")} />
            <Field label="Services" value={(r.services_offered || []).join(" · ")} />
            <Field label="Area" value={r.area} span />
            <Field label="Availability" value={r.availability} span />
          </div>
          <div className="mt-3">
            <OutreachToolbar
              contact={{ phone: r.contact?.phone, email: r.contact?.email, name: r.contact?.name }}
              hideAiCall
              /* No onChannelClick — opening the channel doesn't prove an outreach
                 actually happened. Use the Log buttons below to record an outcome. */
            />
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Stage</h4>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button key={s.key} onClick={() => onUpdate(r.id, { stage: s.key })}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  r.stage === s.key
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10"
                    : "border-navy-200 text-navy-600 hover:bg-navy-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                }`}>{s.label}</button>
            ))}
          </div>
        </section>

        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Log a note</label>
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes from conversation…" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn-secondary text-xs" onClick={() => log("note")}>Save note</button>
          </div>
        </section>

        {(r.timeline || []).length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Timeline</h4>
            <ul className="space-y-1.5">
              {r.timeline.map((e, i) => (
                <li key={i} className="rounded-lg border border-navy-100 p-2 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-navy-500 dark:text-slate-400">
                    <span className="font-semibold capitalize text-navy-700 dark:text-slate-200">{e.channel} · {e.direction}</span>
                    <span>{new Date(e.ts).toLocaleString("en-GB")}</span>
                  </div>
                  {e.note && <p className="mt-0.5 text-navy-700 dark:text-slate-300">{e.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetailSlideOver>
  );
}

function Field({ label, value, span }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</div>
      <div className="text-sm font-medium text-navy-900 dark:text-slate-100">{value || "—"}</div>
    </div>
  );
}

function AddRecruitModal({ open, onClose, onSave }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", trade: "", services: "", area: "", availability: "", notes: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} title="Add engineer recruit"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => {
          if (!f.name.trim()) { toast.error("Name required"); return; }
          onSave({ ...f, contact: { name: f.name, phone: f.phone, email: f.email } });
        }}>Add</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Name *</label><input className="input" value={f.name} onChange={set("name")} /></div>
        <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
        <div><label className="label">Email</label><input className="input" value={f.email} onChange={set("email")} /></div>
        <div><label className="label">Trade</label><input className="input" value={f.trade} onChange={set("trade")} placeholder="gas, electrical" /></div>
        <div><label className="label">Services</label><input className="input" value={f.services} onChange={set("services")} placeholder="GAS, EICR" /></div>
        <div><label className="label">Area</label><input className="input" value={f.area} onChange={set("area")} /></div>
        <div><label className="label">Availability</label><input className="input" value={f.availability} onChange={set("availability")} /></div>
        <div className="col-span-2"><label className="label">Notes</label><textarea className="input min-h-16" value={f.notes} onChange={set("notes")} /></div>
      </div>
    </Modal>
  );
}
