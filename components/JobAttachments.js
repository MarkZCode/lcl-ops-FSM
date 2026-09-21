"use client";

import { useRef, useState } from "react";
import {
  FiUploadCloud,
  FiTrash2,
  FiFile,
  FiImage,
  FiDownload,
  FiPaperclip,
} from "react-icons/fi";
import { fmtDate } from "@/lib/format";
import Folder from "@/components/Folder";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

const MAX_BYTES = 9 * 1024 * 1024; // 9 MB per file (stored in Supabase Storage)

function prettySize(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

// Attach certificates (CP12 / EICR PDFs), photos and any other job documents.
export default function JobAttachments({ job, onSave }) {
  const inputRef = useRef(null);
  const { updateJob } = useStore();
  const [error, setError] = useState("");
  const [certMsg, setCertMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const files = job.attachments || [];

  const addFiles = async (fileList) => {
    setError("");
    setCertMsg("");
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setBusy(true);
    let next = [...files];
    let detectedExpiry = null;
    for (const file of incoming) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is too large (max 9 MB).`);
        continue;
      }
      const up = await uploadFile(file, `jobs/${job.id}`);
      next = [
        {
          id: "att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          ...up,
          addedAt: new Date().toISOString(),
        },
        ...next,
      ];
      // Try to extract cert expiry from PDFs.
      if (file.type === "application/pdf" && !job.certExpiry && !detectedExpiry) {
        try {
          const { extractCertExpiry } = await import("@/lib/certParser");
          const expiry = await extractCertExpiry(file);
          if (expiry) detectedExpiry = expiry;
        } catch {}
      }
    }
    const patch = { attachments: next };
    if (detectedExpiry) {
      patch.certExpiry = detectedExpiry;
      setCertMsg(`Certificate expiry auto-detected: ${detectedExpiry}`);
      toast(`Expiry set from PDF: ${detectedExpiry}`, "info");
    }
    onSave(job.id, patch);
    setBusy(false);
  };

  const remove = (id) => {
    const f = files.find((x) => x.id === id);
    if (f?.path) removeFile(f.path);
    return doRemove(id);
  };

  const doRemove = (id) =>
    onSave(job.id, { attachments: files.filter((f) => f.id !== id) });

  const view = (f) => {
    const src = fileSrc(f);
    if (!src) return;
    const w = window.open("", "_blank");
    if (!w) return;
    if (f.type?.startsWith("image/")) {
      w.document.write(`<img src="${src}" style="max-width:100%">`);
    } else {
      w.location.href = src;
    }
  };

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 section-label text-sm">
          <FiPaperclip /> Documents &amp; photos
        </h2>
        <button
          className="btn-outline py-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <FiUploadCloud /> Upload
        </button>
      </div>

      {files.length === 0 ? (
        <div className="space-y-2">
        {/* Decorative, but deliberately OUTSIDE the drop target below: nested
            inside it, the folder would either swallow the click that opens
            the file picker or have to be pointer-events-none, which kills its
            own hover animation. Out here it stays interactive and the whole
            dashed area still browses. */}
        <div aria-hidden className="h-[176px]">
          <Folder color="blue" size="sm" />
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-navy-300 bg-navy-50/50 py-6 text-xs text-navy-500 hover:border-brand-400 hover:text-brand-600"
        >
          <FiUploadCloud className="h-5 w-5" />
          Drop certificates (CP12, EICR…) or photos here, or click to browse
        </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            const isImg = f.type?.startsWith("image/");
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-navy-100 bg-white p-2"
              >
                <button
                  onClick={() => view(f)}
                  className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-navy-200 bg-navy-50 text-navy-400"
                  title="Open"
                >
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileSrc(f)} alt={f.name} className="h-full w-full object-cover" />
                  ) : f.type === "application/pdf" ? (
                    <FiFile className="h-5 w-5" />
                  ) : (
                    <FiImage className="h-5 w-5" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-800">{f.name}</p>
                  <p className="text-[11px] text-navy-400">
                    {prettySize(f.size)} · {fmtDate(f.addedAt)}
                  </p>
                </div>
                <a
                  href={fileSrc(f)}
                  download={f.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-500 hover:border-brand-300 hover:text-brand-600"
                  title="Download"
                >
                  <FiDownload className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => remove(f.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50"
                  title="Remove"
                >
                  <FiTrash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      {certMsg && <p className="mt-2 text-xs font-semibold text-brand-700">✓ {certMsg}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
    </section>
  );
}
