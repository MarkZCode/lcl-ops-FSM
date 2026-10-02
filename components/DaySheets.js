"use client";

// Each engineer's jobs for one day as a message: time, service, postcode,
// reference — ready to send on WhatsApp, or to print as one sheet.
// It carries what an engineer needs to plan the day, not the client's
// phone number or the price; the full job card still goes per job.
import { useMemo } from "react";
import { isSameDay, parseISO, format } from "date-fns";
import { FaWhatsapp } from "react-icons/fa";
import { FiPrinter, FiCopy } from "react-icons/fi";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { visitEntries } from "@/lib/visits";
import { jobTags, fmtTime } from "@/lib/format";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { toast } from "@/lib/toast";

export default function DaySheets({ open, onClose, day }) {
  const { jobs, clients, engineers } = useStore();
  const sheets = useMemo(() => {
    if (!open) return [];
    const entries = visitEntries(jobs).filter((e) => e.scheduledAt && isSameDay(parseISO(e.scheduledAt), day) && e.job.status !== "cancelled");
    return engineers
      .map((eng) => {
        const mine = entries.filter((e) => e.engineerId === eng.id).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        const lines = mine.map((e, i) => {
          const c = clients.find((x) => x.id === e.job.clientId);
          const p = c?.properties?.find((x) => x.id === e.job.propertyId);
          const what = jobTags({ ...e.job, lineItems: e.lines }).map((t) => t.label).join(", ");
          const win = e.windowFrom && e.windowTo ? `${e.windowFrom}–${e.windowTo}` : fmtTime(e.scheduledAt);
          return `${i + 1}. ${win} · ${what || "Job"} · ${p?.postcode || "postcode to follow"} · ${e.job.id}`;
        });
        const text = `Hi ${eng.name.split(" ")[0]}, your jobs for ${format(day, "EEEE d MMMM")}:\n\n${lines.join("\n")}\n\nPlease confirm you're all set. Full job cards to follow for each.`;
        return { eng, count: mine.length, lines, text };
      })
      .filter((s) => s.count > 0);
  }, [open, jobs, clients, engineers, day]);

  const printAll = () => {
    const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<title>Day sheet ${format(day, "d MMM yyyy")}</title><body style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;padding:32px;color:#14213D"><h1 style="font-size:20px;margin:0 0 16px">Day sheet — ${esc(format(day, "EEEE d MMMM yyyy"))}</h1>${sheets.map((s) => `<h2 style="font-size:15px;margin:18px 0 6px">${esc(s.eng.name)} (${s.count})</h2><ol style="margin:0;padding-left:20px">${s.lines.map((l) => `<li>${esc(l.replace(/^\d+\.\s/, ""))}</li>`).join("")}</ol>`).join("")}</body>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Modal open={open} onClose={onClose} wide title={`Day sheets — ${format(day, "EEE d MMM")}`} footer={
      <>
        <button className="btn-outline" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!sheets.length} onClick={printAll}><FiPrinter /> Print all</button>
      </>
    }>
      {sheets.length === 0 ? (
        <p className="text-sm text-navy-500">No engineer has jobs booked for this day.</p>
      ) : (
        <ul className="space-y-3">
          {sheets.map((s) => (
            <li key={s.eng.id} className="rounded-lg border border-navy-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy-900">{s.eng.name} <span className="font-normal text-navy-500">· {s.count} job{s.count === 1 ? "" : "s"}</span></p>
                <span className="flex gap-2">
                  <button type="button" className="btn-outline py-1 text-xs" onClick={() => navigator.clipboard.writeText(s.text).then(() => toast.success("Copied."))}><FiCopy /> Copy</button>
                  <button type="button" className="btn bg-[#25D366] py-1 text-xs text-white hover:bg-[#1ebe5b]" onClick={() => { if (!openWhatsAppChat(s.eng.phone, s.text)) toast.error(`No phone number saved for ${s.eng.name}.`); }}><FaWhatsapp /> WhatsApp</button>
                </span>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-navy-700">{s.lines.join("\n")}</pre>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
