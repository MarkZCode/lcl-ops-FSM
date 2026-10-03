"use client";

// Company expenses for the period on screen — grouped so the totals mean
// something (Staff · Cost of jobs · Running costs · Bank & money · Other),
// with owner drawings listed but kept out of business profit.
//
// Also: a category is suggested from the name as you type; recurring costs
// can be stopped from a month; old entries filed under the previous
// category names can be re-filed in one go; a CSV for the accountant.
import { useMemo, useState } from "react";
import { FiPlus, FiX, FiCheckCircle, FiEdit2, FiTrash2, FiChevronDown, FiExternalLink, FiCopy, FiDownload } from "react-icons/fi";
import { gbp } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  EXPENSE_GROUPS, EXPENSE_CATEGORIES, DRAWINGS, categoryOf, groupOf, isLegacyCategory, suggestCategory, summarise, expensesCsv, recurringActiveIn, isDrawing,
} from "@/lib/expenses";

const GROUP_TONE = {
  staff: "bg-blue-100 text-blue-700",
  jobs: "bg-teal-100 text-teal-700",
  running: "bg-amber-100 text-amber-700",
  money: "bg-slate-100 text-slate-600",
  other: "bg-gray-100 text-gray-600",
  drawings: "bg-rose-100 text-rose-700",
};
const tone = (cat) => GROUP_TONE[groupOf(cat).key] || GROUP_TONE.other;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const blank = () => ({ name: "", amount: "", category: "", date: today(), recurring: false, recurringUntil: "", notes: "" });

function CategorySelect({ value, onChange, className = "input" }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Choose…</option>
      {EXPENSE_GROUPS.map((g) => (
        <optgroup key={g.key} label={g.label}>
          {g.cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function ExpensesPanel({ expenses, breakdown, rangeLabel, revenue = 0, addExpense, updateExpense, removeExpense, onOpenPay }) {
  const [editing, setEditing] = useState(null); // id | "new"
  const [form, setForm] = useState(blank);
  const [picked, setPicked] = useState(false); // category chosen by hand
  const [feesOpen, setFeesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const lines = breakdown.lines || [];
  const groups = useMemo(() => summarise(lines), [lines]);
  const businessTotal = breakdown.total;
  const drawingsTotal = breakdown.drawingsTotal || 0;

  // Rows still filed under an old name, or under "Other".
  const toReview = useMemo(
    () => expenses.filter((e) => e.category !== "Bank Transfer Fees" && (isLegacyCategory(e.category) || e.category === "Other")),
    [expenses]
  );
  const [refile, setRefile] = useState({});
  const openReview = () => {
    setRefile(Object.fromEntries(toReview.map((e) => [e.id, suggestCategory(e.name) || categoryOf(e)])));
    setReviewOpen(true);
  };
  const applyReview = () => {
    let n = 0;
    for (const e of toReview) {
      const c = refile[e.id];
      if (c && c !== e.category) { updateExpense(e.id, { category: c }); n++; }
    }
    setReviewOpen(false);
    toast.success(n ? `${n} expense${n === 1 ? "" : "s"} re-filed` : "Nothing changed");
  };

  const startNew = () => { setEditing("new"); setForm(blank()); setPicked(false); };
  const startEdit = (e) => {
    setForm({ name: e.name || "", amount: String(e.amount ?? ""), category: categoryOf(e), date: e.date || today(), recurring: !!e.recurring, recurringUntil: e.recurringUntil || "", notes: e.notes || "" });
    setPicked(true);
    setEditing(e.id);
  };
  const setName = (name) => setForm((f) => ({ ...f, name, ...(picked ? {} : { category: suggestCategory(name) || f.category }) }));

  const save = () => {
    if (!form.name.trim() || !form.amount) return;
    const row = {
      name: form.name.trim(), amount: Number(form.amount), category: form.category || suggestCategory(form.name) || "Other",
      date: form.date, recurring: form.recurring, recurringUntil: form.recurring && form.recurringUntil ? form.recurringUntil : "", notes: form.notes.trim(),
    };
    if (editing === "new") addExpense(row);
    else updateExpense(editing, row);
    setEditing(null);
  };
  const remove = (e) => {
    removeExpense(e.id);
    // Restored under a new id — the old one is tombstoned on every device.
    const { id, ...rest } = e;
    toast.undo("Expense deleted", () => addExpense(rest));
  };
  const again = (e) => {
    const { id, linkedPaymentId, staffId, ...rest } = e;
    const made = addExpense({ ...rest, date: today() });
    toast.undo(`Logged again today — ${e.name}`, () => removeExpense(made.id));
  };
  const exportCsv = () => {
    const blob = new Blob([expensesCsv(lines)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `LCL expenses — ${rangeLabel}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // One row per expense in the period (a recurring cost shows once, with
  // how many months it counted for).
  const rows = useMemo(() => {
    const m = new Map();
    for (const l of lines) {
      const cur = m.get(l.e.id) || { e: l.e, amount: 0, months: 0 };
      cur.amount += l.amount; cur.months += 1;
      m.set(l.e.id, cur);
    }
    return [...m.values()].sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
  }, [lines]);
  const feeRows = rows.filter((r) => r.e.category === "Bank Transfer Fees");
  const feeTotal = feeRows.reduce((s, r) => s + r.amount, 0);
  const otherRows = rows.filter((r) => r.e.category !== "Bank Transfer Fees");
  // What runs every month right now (subscriptions, phone numbers…) — the
  // floor the month starts from before a single job is done.
  const thisMonth = today().slice(0, 7);
  const fixed = expenses.filter((e) => !isDrawing(e) && recurringActiveIn(e, thisMonth));
  const fixedTotal = fixed.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const pct = (v) => (revenue > 0 ? `${Math.round((v / revenue) * 100)}% of revenue` : "");

  const Row = ({ r }) => {
    const cat = categoryOf(r.e);
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <span className={`hidden shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold sm:inline ${tone(cat)}`}>{cat}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy-800">{r.e.name}</p>
          <p className="truncate text-xs text-navy-400">
            <span className="sm:hidden">{cat} · </span>{r.e.date}{r.e.recurring ? ` · monthly${r.months > 1 ? ` × ${r.months}` : ""}${r.e.recurringUntil ? ` · stopped after ${r.e.recurringUntil}` : ""}` : ""}
            {isLegacyCategory(r.e.category) ? <span className="text-amber-600"> · old category</span> : ""}
            {r.e.notes ? ` · ${r.e.notes}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-black text-navy-900">{gbp(r.amount)}</span>
        <div className="flex shrink-0 gap-1">
          {!r.e.recurring && <button onClick={() => again(r.e)} title="Log again today" className="hidden h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600 sm:grid"><FiCopy className="h-3.5 w-3.5" /></button>}
          <button onClick={() => startEdit(r.e)} title="Edit" className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600"><FiEdit2 className="h-3.5 w-3.5" /></button>
          <button onClick={() => remove(r.e)} title="Delete" className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-rose-600"><FiTrash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head panel-head-ruled flex-wrap">
        <div>
          <span className="panel-title">Company expenses · {rangeLabel}</span>
          <p className="panel-sub">Staff, job costs, running costs and fees — owner drawings kept separate</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-navy-500">Total <strong className="text-base font-black text-rose-600">{gbp(businessTotal)}</strong></span>
          {lines.length > 0 && <button onClick={exportCsv} className="btn-outline py-1.5 text-xs" title="Spreadsheet for the accountant"><FiDownload /> CSV</button>}
          <button onClick={startNew} className="btn-primary py-1.5 text-xs"><FiPlus /> Add expense</button>
        </div>
      </div>

      {toReview.length > 0 && !reviewOpen && (
        <button onClick={openReview} className="flex w-full items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-left text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <strong>{toReview.length} expense{toReview.length === 1 ? "" : "s"}</strong> filed under the old categories or &ldquo;Other&rdquo;. <span className="ml-auto font-semibold underline">Re-file them</span>
        </button>
      )}
      {reviewOpen && (
        <div className="border-b border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="mb-3 text-sm text-navy-700 dark:text-slate-200">A category is suggested from each name — check them, change any that are wrong, then save. Anything personal goes in <strong>{DRAWINGS}</strong> so it isn&rsquo;t counted as a business cost.</p>
          <div className="max-h-[50vh] divide-y divide-amber-100 overflow-y-auto rounded-xl border border-amber-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
            {toReview.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-800">{e.name}</p>
                  <p className="text-xs text-navy-400">{e.date} · {gbp(Number(e.amount) || 0)} · was {e.category}</p>
                </div>
                <CategorySelect className="input w-full py-1 text-sm sm:w-56" value={refile[e.id] || ""} onChange={(v) => setRefile((r) => ({ ...r, [e.id]: v }))} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-outline py-1.5 text-xs" onClick={() => setReviewOpen(false)}><FiX /> Cancel</button>
            <button className="btn-primary py-1.5 text-xs" onClick={applyReview}><FiCheckCircle /> Save categories</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="border-b border-brand-100 bg-brand-50/50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="label">What was it</label>
              <input className="input" placeholder="e.g. UK SIM balance · Claude subscription" value={form.name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">Amount (£)</label>
              <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category{!picked && form.category ? <span className="font-normal text-brand-600"> · suggested</span> : null}</label>
              <CategorySelect value={form.category} onChange={(v) => { setPicked(true); setForm((f) => ({ ...f, category: v })); }} />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="input" placeholder="Note (optional) — receipt no., who paid, what for" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} className="h-4 w-4 rounded border-navy-300 text-brand-500" />
                Every month from this date
              </label>
              {form.recurring && (
                <label className="flex items-center gap-2 text-sm text-navy-600">
                  Stopped after
                  <input type="month" className="input w-40 py-1" value={form.recurringUntil} onChange={(e) => setForm((f) => ({ ...f, recurringUntil: e.target.value }))} />
                </label>
              )}
            </div>
          </div>
          {form.category === DRAWINGS && <p className="mt-2 text-xs text-rose-700">Owner drawings are listed here but not counted as a business expense or taken off profit.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-outline py-1.5 text-xs"><FiX /> Cancel</button>
            <button onClick={save} className="btn-primary py-1.5 text-xs"><FiCheckCircle /> Save</button>
          </div>
        </div>
      )}

      {/* By group */}
      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-px border-b border-navy-100 bg-navy-100 sm:grid-cols-3 lg:grid-cols-6">
          {groups.map((g) => (
            <div key={g.key} className="bg-white px-4 py-3 dark:bg-transparent">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{g.key === "drawings" ? "Owner drawings" : g.label}</p>
              <p className={`text-base font-black ${g.key === "drawings" ? "text-rose-600" : "text-navy-900"}`}>{gbp(g.total)}</p>
              <p className="truncate text-[11px] text-navy-400">{g.key === "drawings" ? "not a business cost" : pct(g.total) || g.cats.map((c) => c.cat).join(", ")}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-navy-400">
          {expenses.length === 0 ? "No expenses logged yet." : `No expenses in ${rangeLabel}. Change the period above to see others.`}
        </p>
      ) : (
        <div className="divide-y divide-navy-100">
          {feeRows.length > 0 && (
            <>
              <button onClick={() => setFeesOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-navy-50">
                <span className={`hidden shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold sm:inline ${tone("Bank Transfer Fees")}`}>Bank Transfer Fees</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-800">Bank transfer fees</p>
                  <p className="text-xs text-navy-400">{feeRows.length} engineer transfer{feeRows.length !== 1 ? "s" : ""} · tap to {feesOpen ? "hide" : "view"}</p>
                </div>
                <span className="shrink-0 text-sm font-black text-navy-900">{gbp(feeTotal)}</span>
                <FiChevronDown className={`h-4 w-4 shrink-0 text-navy-400 transition-transform ${feesOpen ? "rotate-180" : ""}`} />
              </button>
              {feesOpen && feeRows.map((r) => (
                <div key={r.e.id} className="flex items-center gap-3 bg-navy-50/50 py-2.5 pl-12 pr-5 dark:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-navy-700">{r.e.name}</p>
                    <p className="text-xs text-navy-400">{r.e.date}</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-navy-800">{gbp(r.amount)}</span>
                  {r.e.linkedPaymentId && onOpenPay && (
                    <button onClick={onOpenPay} title="Open the engineer payment this fee came from" className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600"><FiExternalLink className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
            </>
          )}
          {EXPENSE_GROUPS.map((g) => {
            const list = otherRows.filter((r) => groupOf(categoryOf(r.e)).key === g.key);
            if (!list.length) return null;
            return (
              <div key={g.key}>
                <p className="bg-navy-50/60 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400 dark:bg-white/[0.03]">{g.label}</p>
                {list.map((r) => <Row key={r.e.id} r={r} />)}
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-navy-100 px-5 py-3 text-[11px] text-navy-400">
        A one-off expense counts in the period its date falls in. A monthly one counts in every month from its date until the month it was stopped.
        {fixed.length ? ` Fixed every month right now: ${gbp(fixedTotal)} (${fixed.length} recurring).` : ""}
        {drawingsTotal > 0 ? ` Owner drawings this period: ${gbp(drawingsTotal)} — not included in the total or in profit.` : ""}
      </p>
    </div>
  );
}

export { EXPENSE_CATEGORIES };
