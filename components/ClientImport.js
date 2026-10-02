"use client";

// Bring clients in from a spreadsheet: paste the rows, see exactly what will
// be added and what's skipped as a duplicate, then import.
import { useMemo, useState } from "react";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { parseClientCsv } from "@/lib/clients";
import { formatPostcode } from "@/lib/enquiry";
import { toast } from "@/lib/toast";

export default function ClientImport({ open, onClose }) {
  const { clients, addClient } = useStore();
  const [text, setText] = useState("");
  const { rows, error } = useMemo(() => (text.trim() ? parseClientCsv(text, clients) : { rows: [], error: "" }), [text, clients]);
  const good = rows.filter((r) => !r.problem);

  const run = () => {
    const stamp = Date.now().toString(36);
    good.forEach((r, i) => {
      const pc = r.postcode ? formatPostcode(r.postcode) : "";
      addClient({
        id: `cl-${stamp}-${i}`,
        name: r.name, email: r.email, phone: r.phone, company: r.company, source: "import",
        properties: r.address || pc ? [{ id: `pr-${stamp}-${i}`, label: r.address || pc, postcode: pc, area: "", beds: 0 }] : [],
      });
    });
    toast.success(`${good.length} client${good.length === 1 ? "" : "s"} added.`);
    setText("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title="Import clients" footer={
      <>
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!good.length} onClick={run}>Add {good.length || ""} client{good.length === 1 ? "" : "s"}</button>
      </>
    }>
      <div className="space-y-3 text-sm">
        <p className="text-navy-600">Copy the rows from your spreadsheet, including the header row, and paste them here. Columns it understands: <strong>Name</strong>, Email, Phone, Company, Address, Postcode — in any order.</p>
        <textarea className="input resize-y font-mono text-xs" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Name,Email,Phone,Address,Postcode\nJane Smith,jane@example.com,07700 900000,12 High St,SE1 7PB"} />
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        {rows.length > 0 && (
          <>
            <p className="text-xs text-navy-500">{good.length} will be added{rows.length - good.length ? ` · ${rows.length - good.length} skipped` : ""}.</p>
            <div className="max-h-64 overflow-auto rounded-lg border border-navy-100">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-navy-100">
                  {rows.map((r) => (
                    <tr key={r.n} className={r.problem ? "bg-navy-50 text-navy-400" : ""}>
                      <td className="px-3 py-1.5 font-semibold">{r.name || "—"}</td>
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className="px-3 py-1.5">{r.phone}</td>
                      <td className="px-3 py-1.5">{r.postcode}</td>
                      <td className="px-3 py-1.5 text-rose-600">{r.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
