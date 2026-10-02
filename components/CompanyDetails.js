"use client";

// Company details and logo — what is printed on quotes, invoices, receipts
// and statements, and signed under the automatic emails. Leave a field empty
// to go back to the built-in value.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { COMPANY_FIELDS, companyDefaults } from "@/lib/invoiceConfig";
import { toast } from "@/lib/toast";

const LABELS = {
  company: "Company name",
  address: "Address",
  phone: "Phone",
  email: "Email on quotes",
  accountsEmail: "Email on invoices and receipts",
  website: "Website",
};

// Shrink to fit the 58pt chip on the documents; PNG keeps a transparent
// background. Returns a data URL.
function logoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read.")); };
    img.src = url;
  });
}

export default function CompanyDetails() {
  const { company, saveCompany } = useStore();
  const defaults = companyDefaults();
  const [draft, setDraft] = useState(company || {});
  useEffect(() => { setDraft(company || {}); }, [company]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(company || {});

  const pickLogo = async (file) => {
    if (!file) return;
    try { setDraft((d) => ({ ...d, logo: "" })); const logo = await logoDataUrl(file); setDraft((d) => ({ ...d, logo })); }
    catch (e) { toast.error(String(e.message || e)); }
  };

  return (
    <section>
      <h2 className="mb-3 section-label text-sm">Company details on documents</h2>
      <div className="card p-5">
        <p className="text-xs text-navy-500">Printed on quotes, invoices, receipts and statements. A document already sent keeps what it went out with. Leave a field empty to use the built-in value.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COMPANY_FIELDS.map((f) => (
            <div key={f} className={f === "address" ? "sm:col-span-2" : ""}>
              <label className="label">{LABELS[f]}</label>
              <input className="input" value={draft[f] || ""} placeholder={defaults[f] || ""} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-navy-100 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.logo || "/icon-192.png"} alt="Logo" className="max-h-12 max-w-12 object-contain" />
          </span>
          <label className="btn-outline cursor-pointer py-1.5 text-xs">
            Change logo
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {draft.logo && <button type="button" className="text-xs font-semibold text-navy-500 underline" onClick={() => setDraft((d) => ({ ...d, logo: "" }))}>Use the built-in logo</button>}
          <span className="text-xs text-navy-400">Square works best.</span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {dirty && <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => setDraft(company || {})}>Undo changes</button>}
          <button type="button" className="btn-primary py-1.5 text-xs" disabled={!dirty} onClick={() => { saveCompany(draft); toast.success("Company details saved."); }}>Save</button>
        </div>
      </div>
    </section>
  );
}
