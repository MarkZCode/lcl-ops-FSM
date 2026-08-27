"use client";

import { useRef, useState } from "react";
import { FiUploadCloud, FiTrash2, FiExternalLink, FiImage, FiMapPin } from "react-icons/fi";
import { fmtDate, gbp } from "@/lib/format";
import { parkingReconcile } from "@/lib/finance";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";

const MAX_BYTES = 9 * 1024 * 1024;

// Log engineer parking reimbursement for a job — always available when an
// engineer is assigned (not only when parking was pre-charged on the invoice).
export default function ParkingReceipt({ job, onSave }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parking = parkingReconcile(job);
  const proof = job.parkingReceiptProof;

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
    const up = await uploadFile(file, `jobs/${job.id}/parking`);
    onSave(job.id, {
      parkingReceiptProof: { ...up, uploadedAt: new Date().toISOString() },
      parkingReceiptSubmitted: true,
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
    onSave(job.id, { parkingReceiptProof: null });
  };

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 section-label text-sm">
        <FiMapPin className="text-brand-500" /> Parking receipt
      </h2>
      <p className="mb-3 text-xs text-navy-400">
        Mark when the engineer submits a parking receipt and enter the amount to reimburse.
      </p>

      <div className="space-y-3 rounded-lg border border-navy-100 bg-navy-50/40 p-3 text-sm">
        <div className="flex justify-between text-xs">
          <span className="text-navy-500">Charged to customer</span>
          <span className="font-medium text-navy-800">{gbp(parking.charged)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-navy-700">
            <input
              type="checkbox"
              checked={!!job.parkingReceiptSubmitted}
              onChange={(e) => onSave(job.id, { parkingReceiptSubmitted: e.target.checked })}
              className="h-4 w-4 rounded border-navy-300 text-brand-500"
            />
            <span className="text-sm font-semibold">Receipt submitted</span>
          </label>
          <div className="relative min-w-[7rem] flex-1 sm:max-w-[10rem]">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">£</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={job.parkingReceiptAmount ?? ""}
              onChange={(e) => onSave(job.id, { parkingReceiptAmount: e.target.value })}
              className="input h-9 w-full pl-6 text-sm"
              aria-label="Parking receipt amount"
            />
          </div>
        </div>
        {job.parkingReceiptSubmitted && (
          <p className="text-xs text-brand-700">
            Reimbursement: <strong>{gbp(parking.reimbursed)}</strong>
            {parking.retained < 0 && (
              <span className="text-rose-600"> · company absorbs {gbp(Math.abs(parking.retained))}</span>
            )}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
          <FiImage className="text-navy-400" /> Receipt photo (optional)
        </p>
        {proof ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={view}
              className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-navy-200"
              title="View full size"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileSrc(proof)} alt="Parking receipt" className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate font-medium text-navy-800">{proof.name}</p>
              <p className="text-navy-400">Uploaded {fmtDate(proof.uploadedAt)}</p>
              <div className="mt-1 flex gap-3">
                <button type="button" onClick={view} className="inline-flex items-center gap-1 font-semibold text-brand-600">
                  <FiExternalLink /> View
                </button>
                <button type="button" onClick={removeProof} className="inline-flex items-center gap-1 font-semibold text-rose-500">
                  <FiTrash2 /> Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-navy-300 bg-white py-4 text-xs text-navy-500 hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
          >
            <FiUploadCloud className="h-5 w-5" />
            {busy ? "Uploading…" : "Upload parking receipt photo"}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
    </section>
  );
}
