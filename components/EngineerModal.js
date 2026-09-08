"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { ENGINEER_TYPES, ENGINEER_PAY_TYPES, DEFAULT_ENGINEER_CUT, DEFAULT_GAS_BASE_RATE, DEFAULT_GAS_EXTRA_RATE, DEFAULT_SERVICE_RATES } from "@/lib/constants";

const empty = {
  name: "",
  type: "Individual",
  company: "",
  phone: "",
  email: "",
  postcode: "",
  areas: "",
  trade: "",
  services: [],
  cutPercent: DEFAULT_ENGINEER_CUT,
  vatRegistered: false,
  // Defaults to the per-service/per-tier structure — this mirrors the exact
  // service+tier breakdown from the customer pricing catalog (Settings →
  // Service catalogue), which is how pay is actually agreed with engineers:
  // a specific rate per service, per size/count tier, not one flat % cut.
  payType: "fixed_service",
  weeklyRate: "",
  gasBaseRate: DEFAULT_GAS_BASE_RATE,
  gasExtraRate: DEFAULT_GAS_EXTRA_RATE,
  // { [serviceCode]: number } for flat-rate services, OR
  // { [serviceCode]: { [tierLabel]: number } } for tiered services — see
  // rateForLine() in lib/finance.js, the single place this shape is read.
  serviceRates: {},
  inspectionRates: {},
  bankName: "",
  bankAccountName: "",
  bankSortCode: "",
  bankAccountNumber: "",
  notes: "",
};

export default function EngineerModal({ open, onClose, engineer, prefill, onSaved }) {
  const { addEngineer, updateEngineer, catalog } = useStore();
  const [form, setForm] = useState(empty);
  // Only treat as an edit when we have an actual saved engineer (id present).
  // `prefill` populates the new-engineer form (used by recruitment onboarding).
  const isEdit = Boolean(engineer && engineer.id);
  const seed = engineer || prefill;
  const initRef = useRef(null);

  // Real services only (exclude add-on charges like parking/congestion).
  const services = catalog.filter((s) => !s.addon);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = seed ? `eng-${seed.id || 'prefill'}` : `new`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    setForm(
      seed
        ? {
            name: seed.name || "",
            type: seed.type || "Individual",
            company: seed.company || "",
            phone: seed.phone || "",
            email: seed.email || "",
            postcode: seed.postcode || "",
            areas: seed.areas || "",
            trade: seed.trade || "",
            services: seed.services || [],
            cutPercent:
              seed.cutPercent != null ? seed.cutPercent : DEFAULT_ENGINEER_CUT,
            vatRegistered: !!seed.vatRegistered,
            payType: seed.payType || "per_job",
            weeklyRate: seed.weeklyRate != null ? String(seed.weeklyRate) : "",
            gasBaseRate: seed.gasBaseRate != null ? seed.gasBaseRate : DEFAULT_GAS_BASE_RATE,
            gasExtraRate: seed.gasExtraRate != null ? seed.gasExtraRate : DEFAULT_GAS_EXTRA_RATE,
            serviceRates: seed.serviceRates || {},
            inspectionRates: seed.inspectionRates || {},
            bankName: seed.bankName || "",
            bankAccountName: seed.bankAccountName || "",
            bankSortCode: seed.bankSortCode || "",
            bankAccountNumber: seed.bankAccountNumber || "",
            notes: seed.notes || "",
          }
        : empty
    );
  }, [open, engineer, prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleService = (code) =>
    setForm((f) => ({
      ...f,
      services: f.services.includes(code)
        ? f.services.filter((c) => c !== code)
        : [...f.services, code],
    }));

  // Flat rate for a service with no size tiers (e.g. PAT, BOILER).
  const setFlatRate = (code, value) =>
    setForm((f) => ({ ...f, serviceRates: { ...f.serviceRates, [code]: value } }));
  // One rate per property-size tier (e.g. EICR "Studio" vs "4 Bedrooms") —
  // this is the "manually enter what we pay, per service, per size" panel.
  const setTierRate = (code, tierLabel, value) =>
    setForm((f) => {
      const existing = f.serviceRates?.[code];
      const tierMap = existing && typeof existing === "object" ? existing : {};
      return { ...f, serviceRates: { ...f.serviceRates, [code]: { ...tierMap, [tierLabel]: value } } };
    });

  // Inspection-only rates mirror the full-rate setters above, into their own
  // table. Kept separate rather than folded into serviceRates so an engineer
  // with no inspection rate set is distinguishable from one set to £0.
  const setFlatInspRate = (code, value) =>
    setForm((f) => ({ ...f, inspectionRates: { ...f.inspectionRates, [code]: value } }));
  const setTierInspRate = (code, tierLabel, value) =>
    setForm((f) => {
      const existing = f.inspectionRates?.[code];
      const tierMap = existing && typeof existing === "object" ? existing : {};
      return { ...f, inspectionRates: { ...f.inspectionRates, [code]: { ...tierMap, [tierLabel]: value } } };
    });

  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    // Strip blank-string rate entries down to clean numbers (or drop them
    // entirely) so rateForLine()'s fallback-to-default logic works — an
    // empty string would otherwise be treated as "0" instead of "not set".
    const cleanRateTable = (table) => {
      const out = {};
      for (const [code, entry] of Object.entries(table || {})) {
        if (entry && typeof entry === "object") {
          const tiers = {};
          for (const [label, v] of Object.entries(entry)) {
            if (v !== "" && v != null && !Number.isNaN(Number(v))) tiers[label] = Number(v);
          }
          if (Object.keys(tiers).length) out[code] = tiers;
        } else if (entry !== "" && entry != null && !Number.isNaN(Number(entry))) {
          out[code] = Number(entry);
        }
      }
      return out;
    };
    const cleanedRates = cleanRateTable(form.serviceRates);
    const cleanedInspRates = cleanRateTable(form.inspectionRates);
    const payload = {
      ...form,
      name: form.name.trim(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      weeklyRate: form.weeklyRate === "" ? "" : Number(form.weeklyRate),
      gasBaseRate: form.gasBaseRate === "" ? DEFAULT_GAS_BASE_RATE : Number(form.gasBaseRate),
      gasExtraRate: form.gasExtraRate === "" ? DEFAULT_GAS_EXTRA_RATE : Number(form.gasExtraRate),
      serviceRates: cleanedRates,
      inspectionRates: cleanedInspRates,
    };
    if (isEdit) updateEngineer(engineer.id, payload);
    else addEngineer(payload);
    onSaved?.(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={isEdit ? `Edit ${engineer?.name || "engineer"}` : "Add engineer"}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Save changes" : "Add engineer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              placeholder="e.g. James Okafor"
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => set({ type: e.target.value })}
            >
              {ENGINEER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              {form.type === "Company" ? "Company name" : "Company (optional)"}
            </label>
            <input
              className="input"
              value={form.company}
              placeholder="Trading / company name"
              onChange={(e) => set({ company: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Grade / qualification</label>
            <input
              className="input"
              value={form.trade}
              placeholder="e.g. Gas Safe, NICEIC, DEA"
              onChange={(e) => set({ trade: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone}
              placeholder="07…"
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              value={form.email}
              placeholder="name@example.com"
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Base postcode</label>
            <input
              className="input"
              value={form.postcode}
              placeholder="e.g. SW11"
              onChange={(e) => set({ postcode: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Areas covered</label>
            <input
              className="input"
              value={form.areas}
              placeholder="e.g. South & West London"
              onChange={(e) => set({ areas: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Services covered</label>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const on = form.services.includes(s.code);
              return (
                <button
                  type="button"
                  key={s.code}
                  onClick={() => toggleService(s.code)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    on
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-navy-200 bg-white text-navy-500 hover:border-navy-300"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Pay basis</label>
            <select className="input" value={form.payType} onChange={(e) => set({ payType: e.target.value })}>
              {ENGINEER_PAY_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-navy-400">
              {form.payType === "weekly"
                ? "Weekly retainers are paid each Sunday for Mon–Sun."
                : form.payType === "fixed_gas"
                ? "Fixed fee per Gas Safety job, set by appliance count — independent of the customer price."
                : form.payType === "fixed_service"
                ? "Set what this engineer is paid per service below — flat, or by property size where that service has size tiers. Independent of the customer price, and different engineers can be paid differently for the exact same job."
                : ""}
            </p>
          </div>
          {form.payType === "weekly" ? (
            <div>
              <label className="label">Weekly rate (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={form.weeklyRate}
                placeholder="e.g. 500"
                onChange={(e) => set({ weeklyRate: e.target.value })}
              />
            </div>
          ) : form.payType === "fixed_gas" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">1st appliance (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={form.gasBaseRate}
                  placeholder="24"
                  onChange={(e) => set({ gasBaseRate: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Each extra (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={form.gasExtraRate}
                  placeholder="4"
                  onChange={(e) => set({ gasExtraRate: e.target.value })}
                />
              </div>
            </div>
          ) : form.payType === "fixed_service" ? (
            <div className="sm:col-span-2 space-y-3 rounded-lg border border-navy-200 bg-white p-3">
              {form.services.length === 0 ? (
                <p className="text-xs text-navy-400">Select the services this engineer covers above first.</p>
              ) : (
                form.services.map((code) => {
                  const svc = services.find((s) => s.code === code);
                  if (!svc) return null;

                  // Gas is tiered by appliance count, not property size — reuse
                  // the same base/extra inputs as fixed_gas mode, and
                  // engineerPayout() reads gasBaseRate/gasExtraRate for GAS
                  // under fixed_service too (see lib/finance.js).
                  if (code === "GAS") {
                    return (
                      <div key={code}>
                        <p className="mb-1.5 text-xs font-semibold text-navy-700">{svc.name}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label text-[10px]">1st appliance (£)</label>
                            <input type="number" step="0.01" min="0" className="input h-8 text-sm"
                              value={form.gasBaseRate} placeholder="24"
                              onChange={(e) => set({ gasBaseRate: e.target.value })} />
                          </div>
                          <div>
                            <label className="label text-[10px]">Each extra (£)</label>
                            <input type="number" step="0.01" min="0" className="input h-8 text-sm"
                              value={form.gasExtraRate} placeholder="4"
                              onChange={(e) => set({ gasExtraRate: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (svc.tiers?.length) {
                    return (
                      <div key={code}>
                        <p className="mb-1.5 text-xs font-semibold text-navy-700">{svc.name}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {svc.tiers.map((t) => (
                            <div key={t.label}>
                              <label className="label text-[10px]">{t.label}</label>
                              <input
                                type="number" step="0.01" min="0" className="input h-8 text-sm"
                                value={form.serviceRates?.[code]?.[t.label] ?? ""}
                                placeholder={String(DEFAULT_SERVICE_RATES[code] || 40)}
                                onChange={(e) => setTierRate(code, t.label, e.target.value)}
                              />
                            </div>
                          ))}
                          <div>
                            <label className="label text-[10px]">Any other size (£)</label>
                            <input
                              type="number" step="0.01" min="0" className="input h-8 text-sm"
                              value={form.serviceRates?.[code]?.flat ?? ""}
                              placeholder={String(DEFAULT_SERVICE_RATES[code] || 40)}
                              onChange={(e) => setTierRate(code, "flat", e.target.value)}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] text-navy-400">
                          A job whose size doesn&apos;t match one of the boxes above uses &quot;Any other size&quot; if set, otherwise falls back to the £{DEFAULT_SERVICE_RATES[code] || 40} house default — not what you entered here.
                        </p>
                        {/* Inspection-only rates. Separate table, so "no rate
                            set" stays distinguishable from "set to £0" — an
                            unset inspection rate falls back to the FULL rate
                            rather than paying nothing. */}
                        <div className="mt-2 rounded-md bg-navy-50 p-2 dark:bg-white/[0.04]">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">
                            Inspection only — no certificate issued
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {svc.tiers.map((t) => (
                              <div key={t.label}>
                                <label className="label text-[10px]">{t.label}</label>
                                <input
                                  type="number" step="0.01" min="0" className="input h-8 text-sm"
                                  value={form.inspectionRates?.[code]?.[t.label] ?? ""}
                                  placeholder="—"
                                  onChange={(e) => setTierInspRate(code, t.label, e.target.value)}
                                />
                              </div>
                            ))}
                            <div>
                              <label className="label text-[10px]">Any other size (£)</label>
                              <input
                                type="number" step="0.01" min="0" className="input h-8 text-sm"
                                value={form.inspectionRates?.[code]?.flat ?? ""}
                                placeholder="—"
                                onChange={(e) => setTierInspRate(code, "flat", e.target.value)}
                              />
                            </div>
                          </div>
                          <p className="mt-1 text-[10px] text-navy-400">
                            Left blank, this engineer is paid the full rate above even on an inspection-only visit.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // Flat service — no size tiers (e.g. PAT, BOILER, EMLIGHT, FSC).
                  return (
                    <div key={code}>
                      <p className="mb-1.5 text-xs font-semibold text-navy-700">{svc.name}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label text-[10px]">Full job (£)</label>
                          <input
                            type="number" step="0.01" min="0" className="input h-8 text-sm"
                            value={form.serviceRates?.[code] ?? ""}
                            placeholder={String(DEFAULT_SERVICE_RATES[code] || 40)}
                            onChange={(e) => setFlatRate(code, e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="label text-[10px]">Inspection only (£)</label>
                          <input
                            type="number" step="0.01" min="0" className="input h-8 text-sm"
                            value={form.inspectionRates?.[code] ?? ""}
                            placeholder="—"
                            onChange={(e) => setFlatInspRate(code, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div>
            <label className="label">Engineer cut</label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                className="input pr-7"
                value={form.cutPercent}
                placeholder="40"
                onChange={(e) => set({ cutPercent: e.target.value })}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">
                %
              </span>
            </div>
            <p className="mt-1 text-[11px] text-navy-400">
              Share of the customer price this engineer is paid (LCL standard 40%).
            </p>
          </div>
          )}
          <div className={form.payType === "weekly" || form.payType === "fixed_gas" || form.payType === "fixed_service" ? "sm:col-span-2" : ""}>
            <label className="label">VAT registered</label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-navy-200 bg-white px-3 py-2.5">
              <input
                type="checkbox"
                checked={!!form.vatRegistered}
                onChange={(e) => set({ vatRegistered: e.target.checked })}
                className="h-4 w-4 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
              />
              <span className="text-sm text-navy-700">
                Add 20% VAT on top of this engineer&apos;s share
              </span>
            </label>
            <p className="mt-1 text-[11px] text-navy-400">
              VAT applies to the engineer&apos;s fee only — never the customer invoice.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-4">
          <p className="mb-3 section-label text-xs">Bank details (for pay runs)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Bank name</label>
              <input className="input" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="e.g. Barclays, Monzo, HSBC" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Account name</label>
              <input className="input" value={form.bankAccountName} onChange={(e) => set({ bankAccountName: e.target.value })} placeholder="Name on account" />
            </div>
            <div>
              <label className="label">Sort code</label>
              <input className="input" value={form.bankSortCode} onChange={(e) => set({ bankSortCode: e.target.value })} placeholder="00-00-00" />
            </div>
            <div>
              <label className="label">Account number</label>
              <input className="input" value={form.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} placeholder="12345678" />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={form.notes}
            placeholder="Availability, preferred areas, anything to remember…"
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
