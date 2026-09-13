"use client";

import { useStore } from "@/lib/store";
import { gbp, getJobLines, isAddonCode } from "@/lib/format";
import { certificationRateForLine, inspectionRateForLine, rateForLine } from "@/lib/finance";
import { isSplit, certificationForEngineer, certificationPatch } from "@/lib/visits";

// Who inspected, and who signed the certificate.
//
// The commonest version of this is a SINGLE-service job — one EICR, inspected
// by one engineer and certified by another — and that job has no visits panel
// at all (it only appears once a job is split across 2+ services), so there
// was nowhere to record it. This panel sits on every job and writes to the
// job's own fields; getVisits() mirrors them onto the synthetic visit, so the
// pay maths is the same code path either way.
//
// On a split job each visit is set individually (different services can have
// different arrangements), so this defers to the Visits panel rather than
// competing with it.
export default function CertificationPanel({ job }) {
  const { updateJob, engineers, engineerById } = useStore();

  if (!job || isSplit(job)) return null;

  const attending = engineerById(job.engineerId);
  // Read and write through the same helper the Engineer pay run uses, so the
  // arrangement can be set from either screen and means exactly one thing.
  const current = certificationForEngineer(job, job.engineerId);
  const inspectionOnly = current.inspectionOnly;
  const certifier = current.certifierId ? engineerById(current.certifierId) : null;
  const setCertification = (changes) =>
    updateJob(job.id, certificationPatch(job, job.engineerId, { ...current, ...changes }));
  const lines = getJobLines(job).filter((l) => !isAddonCode(l.code));

  // What this job pays the attending engineer under each arrangement, so the
  // consequence of the toggle is visible before it's flipped rather than
  // discovered later on a statement.
  const fullPay = lines.reduce(
    (s, l) => s + rateForLine(l, attending?.serviceRates, attending?.gasBaseRate, attending?.gasExtraRate),
    0
  );
  const inspPay = lines.reduce((s, l) => {
    const r = inspectionRateForLine(l, attending?.inspectionRates);
    return s + (r != null ? r : rateForLine(l, attending?.serviceRates, attending?.gasBaseRate, attending?.gasExtraRate));
  }, 0);
  const noInspectionRate =
    inspectionOnly &&
    attending &&
    lines.some((l) => inspectionRateForLine(l, attending.inspectionRates) == null);

  const seedFee = (certId) => {
    const cert = engineers.find((e) => e.id === certId);
    if (!cert || !lines.length) return "";
    const total = lines.reduce((s, l) => s + (certificationRateForLine(l, cert) ?? 0), 0);
    return total > 0 ? String(Math.round(total * 100) / 100) : "";
  };

  return (
    <section className="card p-5">
      <h2 className="mb-1 section-label text-sm">Certification</h2>
      <p className="mb-3 text-xs text-navy-500">
        Who carried out the inspection, and who issued the certificate.
      </p>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-navy-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-500"
          checked={inspectionOnly}
          onChange={(e) => setCertification({ inspectionOnly: e.target.checked })}
        />
        <span>
          Inspection only — certificate issued by someone else
          <span className="block text-[11px] text-navy-400">
            {attending?.name || "The assigned engineer"} is paid their inspection
            rate instead of the full rate.
          </span>
        </span>
      </label>

      {!inspectionOnly && attending && (
        <p className="mt-3 rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-500 dark:bg-white/[0.04]">
          {attending.name} is doing the whole job — inspection and certificate —
          and is paid the full rate{fullPay > 0 ? `, ${gbp(fullPay)}` : ""}.
        </p>
      )}

      {inspectionOnly && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-600 dark:bg-white/[0.04]">
            {attending?.name || "Attending engineer"}:{" "}
            <strong className="text-navy-900">{gbp(inspPay)}</strong> for the inspection
            {fullPay > 0 && inspPay !== fullPay ? (
              <span className="text-navy-400"> (full job would be {gbp(fullPay)})</span>
            ) : null}
          </div>

          {noInspectionRate && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10">
              No inspection-only rate set for {attending?.name} on this service, so
              they&apos;re still being paid the full rate. Set one in Engineers → edit
              → rates.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Certificate issued by</label>
              <select
                className="input"
                value={current.certifierId}
                onChange={(e) => {
                  const certifierId = e.target.value;
                  setCertification({
                    certifierId,
                    ...(current.certifierFee ? {} : { certifierFee: seedFee(certifierId) }),
                  });
                }}
              >
                <option value="">Nobody yet</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Pay them (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                placeholder="0.00"
                value={current.certifierFee ?? ""}
                onChange={(e) => setCertification({ certifierFee: e.target.value })}
              />
            </div>
          </div>

          {certifier && Number(current.certifierFee) > 0 && (
            <p className="text-[11px] text-navy-500">
              {certifier.name} is owed{" "}
              <strong className="text-navy-900">{gbp(Number(current.certifierFee))}</strong> for
              this certificate. It shows on their Engineer pay statement against{" "}
              {job.id} and settles through the same payment records as attended work.
            </p>
          )}
          {!certifier && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Nobody recorded as issuing the certificate yet — until one is set,
              nothing is owed for it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
