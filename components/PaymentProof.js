"use client";

import { useRef, useState } from "react";
import { FiUploadCloud, FiTrash2, FiExternalLink, FiImage } from "react-icons/fi";
import { fmtDate } from "@/lib/format";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";

const MAX_BYTES = 9 * 1024 * 1024; // 9 MB cap (stored in Supabase Storage)

// Upload + show a screenshot of the client's payment / paid invoice on a job.
export default function PaymentProof({ job, onSave }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const proof = job.paymentProof;

  const handleFile = async (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image (PNG or JPG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large (max 9 MB).");
      return;
    }
    setBusy(true);
    const up = await uploadFile(file, `jobs/${job.id}/proof`);
    onSave(job.id, {
      paymentProof: { ...up, uploadedAt: new Date().toISOString() },
    });
    setBusy(false);
  };

  const view = () => {
    const src = fileSrc(proof);
    if (!src) return;
    const w = window.open("", "_blank");
    if (w) w.document.write(`<img src="${src}" style="max-width:100%">`);
  };

  const removeProof = () => {
    if (proof?.path) removeFile(proof.path);
    onSave(job.id, { paymentProof: null });
  };

  return (
    <div className="mt-3 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
        <FiImage className="text-navy-400" /> Payment proof
      </p>

      {proof ? (
        <div className="flex items-center gap-3">
          <button
            onClick={view}
            className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-navy-200"
            title="View full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileSrc(proof)}
              alt="Payment proof"
              className="h-full w-full object-cover"
            />
          </button>
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium text-navy-800">{proof.name}</p>
            <p className="text-navy-400">Uploaded {fmtDate(proof.uploadedAt)}</p>
            <div className="mt-1 flex gap-3">
              <button
                onClick={view}
                className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"
              >
                <FiExternalLink /> View
              </button>
              <button
                onClick={removeProof}
                className="inline-flex items-center gap-1 font-semibold text-rose-500 hover:text-rose-600"
              >
                <FiTrash2 /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-navy-300 bg-white py-4 text-xs text-navy-500 hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
        >
          <FiUploadCloud className="h-5 w-5" />
          {busy ? "Uploading…" : "Upload a screenshot of the client's payment"}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
