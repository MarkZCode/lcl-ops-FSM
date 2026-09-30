"use client";

// Upload and track an engineer's documents (see lib/engineerDocs.js).
import { useRef, useState } from "react";
import { FiUploadCloud, FiTrash2, FiFileText, FiAlertTriangle } from "react-icons/fi";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";
import { ENGINEER_DOC_TYPES, docTypeLabel, docStatus, engineerDocIssues } from "@/lib/engineerDocs";

export default function EngineerDocuments({ engineer, documents = [], onChange, folderId }) {
  const inputRef = useRef(null);
  const [type, setType] = useState("gas_safe_card");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsExpiry = ENGINEER_DOC_TYPES.find((t) => t.key === type)?.expires;
  const issues = engineerDocIssues({ ...engineer, documents });

  const add = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setErr("");
    setBusy(true);
    try {
      const added = [];
      for (const f of files) {
        if (f.size > 9 * 1024 * 1024) { setErr(`"${f.name}" is too large (max 9 MB).`); continue; }
        const up = await uploadFile(f, `engineers/${folderId || "new"}`);
        added.push({
          id: "edoc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          type,
          ...up,
          expiresAt: expiresAt || null,
          addedAt: new Date().toISOString(),
        });
      }
      onChange([...added, ...documents]);
      setExpiresAt("");
    } catch {
      setErr("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => {
    const d = documents.find((x) => x.id === id);
    if (d?.path) removeFile(d.path);
    onChange(documents.filter((x) => x.id !== id));
  };

  const badge = (st) =>
    st === "expired" ? "bg-rose-50 text-rose-700" : st === "expiring" ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700";

  return (
    <div className="rounded-lg border border-navy-100 p-3">
      <p className="label">Documents</p>
      {issues.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {issues.map((i) => (
            <li key={`${i.kind}-${i.type}`} className="flex items-center gap-1.5">
              <FiAlertTriangle className="shrink-0" />
              {i.kind === "missing" ? `${i.label} — not on file` : i.kind === "expired" ? `${i.label} — expired ${new Date(i.expiresAt).toLocaleDateString("en-GB")}` : `${i.label} — expires ${new Date(i.expiresAt).toLocaleDateString("en-GB")}`}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select className="input h-9 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          {ENGINEER_DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input
          type="date"
          className="input h-9 text-sm"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          title={needsExpiry ? "Expiry date" : "Expiry date (optional)"}
          placeholder="Expiry"
        />
        <button type="button" className="btn-outline h-9 py-0 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
          <FiUploadCloud /> {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {needsExpiry && !expiresAt && <p className="mt-1 text-[11px] text-navy-400">Add the expiry date so you&apos;re warned before it lapses.</p>}
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {documents.length > 0 && (
        <ul className="mt-3 divide-y divide-navy-100">
          {documents.map((d) => {
            const st = docStatus(d);
            return (
              <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                <FiFileText className="shrink-0 text-navy-400" />
                <a href={fileSrc(d)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-navy-800 hover:text-brand-600">
                  <span className="font-medium">{docTypeLabel(d.type)}</span>
                  <span className="text-navy-400"> · {d.name}</span>
                </a>
                {d.expiresAt && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge(st)}`}>
                    {st === "expired" ? "Expired" : "Expires"} {new Date(d.expiresAt).toLocaleDateString("en-GB")}
                  </span>
                )}
                <button type="button" onClick={() => remove(d.id)} className="shrink-0 rounded p-1 text-navy-400 hover:text-rose-500" title="Remove">
                  <FiTrash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
