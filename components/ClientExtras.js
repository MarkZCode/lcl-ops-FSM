"use client";

// The client record beyond name-and-number: everyone you deal with there,
// notes with dates on them, and the client's own paperwork.
import { useRef, useState } from "react";
import { FiPhone, FiMail, FiPlus, FiTrash2, FiFile, FiUploadCloud } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";
import { fmtDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export default function ClientExtras({ client }) {
  const { updateClient } = useStore();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const who = user?.name || user?.username || "";
  const contacts = client.contacts || [];
  const notes = client.noteLog || [];
  const docs = client.documents || [];

  const addNote = () => {
    const t = note.trim();
    if (t.length < 2) return;
    updateClient(client.id, { noteLog: [{ id: "n-" + Date.now().toString(36), at: new Date().toISOString(), by: who, text: t }, ...notes] });
    setNote("");
  };
  const addDocs = async (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    setBusy(true);
    try {
      let next = [...docs];
      for (const f of files) {
        if (f.size > 9 * 1024 * 1024) { toast.error(`"${f.name}" is too large (max 9 MB).`); continue; }
        const up = await uploadFile(f, `clients/${client.id}`);
        next = [{ id: "cd-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...up, addedAt: new Date().toISOString() }, ...next];
      }
      updateClient(client.id, { documents: next });
    } catch { toast.error("Upload failed — try again."); }
    setBusy(false);
  };
  const removeDoc = (d) => {
    if (!window.confirm(`Remove ${d.name}?`)) return;
    if (d.path) removeFile(d.path);
    updateClient(client.id, { documents: docs.filter((x) => x.id !== d.id) });
  };

  return (
    <>
      {contacts.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 section-label text-sm">Other contacts</h2>
          <ul className="space-y-2.5 text-sm">
            {contacts.map((c) => (
              <li key={c.id}>
                <p className="font-semibold text-navy-900">{c.name || "—"} {c.role && <span className="ml-1 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-600">{c.role}</span>}</p>
                <p className="flex flex-wrap gap-x-4 text-xs text-navy-500">
                  {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-brand-600"><FiPhone /> {c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 break-all hover:text-brand-600"><FiMail /> {c.email}</a>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-3 section-label text-sm">Notes</h2>
        <div className="flex gap-2">
          <input className="input h-9 flex-1 text-sm" placeholder="Add a dated note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
          <button type="button" className="btn-outline py-1.5 text-xs" onClick={addNote}><FiPlus /> Add</button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {notes.slice(0, 30).map((n) => (
            <li key={n.id} className="border-t border-navy-100 pt-2">
              <p className="whitespace-pre-wrap text-navy-700">{n.text}</p>
              <p className="text-[11px] text-navy-400">{fmtDate(n.at)}{n.by ? ` · ${n.by}` : ""}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label text-sm">Client documents</h2>
          <button type="button" className="btn-outline py-1.5 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}><FiUploadCloud /> {busy ? "Uploading…" : "Upload"}</button>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { addDocs(e.target.files); e.target.value = ""; }} />
        </div>
        {docs.length === 0 ? (
          <p className="text-xs text-navy-400">Authorisation letters, signed terms, anything that belongs to the client rather than one job.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <a href={fileSrc(d)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-2 text-navy-700 hover:text-brand-600"><FiFile className="shrink-0 text-navy-400" /><span className="truncate">{d.name}</span></a>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-navy-400">{fmtDate(d.addedAt)}<button type="button" aria-label={`Remove ${d.name}`} className="text-navy-300 hover:text-rose-500" onClick={() => removeDoc(d)}><FiTrash2 /></button></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
