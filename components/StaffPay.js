"use client";

// Staff & salaries — the office team's pay, as a company cost.
//
// Each person has a salary (monthly or weekly). "Pay" records the payment as
// an expense in "Staff salaries", tied to that person, so it lands in the
// P&L like any other cost and the month shows who has and hasn't been paid.
// The staff list is its own settings row (`staff`) — engineers are paid
// per job in Engineer pay, not here.
import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiEdit2, FiCheckCircle, FiX, FiUserMinus } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { gbp } from "@/lib/format";
import { toast } from "@/lib/toast";

const blank = { name: "", role: "", salary: "", frequency: "monthly", payDay: "", startDate: "" };
const ukToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
const monthLabel = (k) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function StaffPay({ expenses = [], addExpense, removeExpense }) {
  const [staff, setStaff] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // id | "new"
  const [form, setForm] = useState(blank);
  const [month, setMonth] = useState(ukToday().slice(0, 7));

  useEffect(() => {
    if (!supabase) { setLoaded(true); return; }
    supabase.from("app_settings").select("data").eq("id", "staff").maybeSingle().then(({ data }) => {
      setStaff(Array.isArray(data?.data?.items) ? data.data.items : []);
      setLoaded(true);
    });
  }, []);

  const persist = async (next) => {
    setStaff(next);
    if (supabase) {
      const { error } = await supabase.from("app_settings").upsert({ id: "staff", data: { items: next } });
      if (error) toast.error("Couldn't save the staff list — try again.");
    }
  };

  const save = () => {
    const salary = Number(form.salary);
    if (!form.name.trim() || !(salary > 0)) return;
    const row = { ...form, name: form.name.trim(), role: form.role.trim(), salary, payDay: form.payDay ? Number(form.payDay) : "" };
    if (editing === "new") persist([...staff, { ...row, id: "st-" + Date.now().toString(36), active: true }]);
    else persist(staff.map((s) => (s.id === editing ? { ...s, ...row } : s)));
    setEditing(null);
  };

  // What each person was paid in the chosen month, from the expenses.
  const paidIn = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      if (!e.staffId || String(e.date || "").slice(0, 7) !== month) continue;
      m.set(e.staffId, [...(m.get(e.staffId) || []), e]);
    }
    return m;
  }, [expenses, month]);

  const due = (s) => (s.frequency === "weekly" ? Math.round(s.salary * 52 / 12 * 100) / 100 : s.salary);
  const active = staff.filter((s) => s.active !== false);
  const totalDue = active.reduce((t, s) => t + due(s), 0);
  const totalPaid = active.reduce((t, s) => t + (paidIn.get(s.id) || []).reduce((a, e) => a + (Number(e.amount) || 0), 0), 0);

  const pay = (s) => {
    const amount = s.salary; // one month's salary, or one week's pay
    const today = ukToday();
    const date = today.slice(0, 7) === month ? today : `${month}-${String(Math.min(28, Number(s.payDay) || 28)).padStart(2, "0")}`;
    const made = addExpense({
      name: `${s.frequency === "weekly" ? "Weekly pay" : "Salary"} — ${s.name} — ${monthLabel(month)}`,
      amount, category: "Staff salaries", date, recurring: false, staffId: s.id, staffName: s.name,
    });
    toast.undo(`${gbp(amount)} recorded for ${s.name}`, () => removeExpense(made.id));
  };

  const shiftMonth = (n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 15));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="panel">
      <div className="panel-head panel-head-ruled flex-wrap">
        <div>
          <span className="panel-title">Staff &amp; salaries</span>
          <p className="panel-sub">Office team pay — counted under Staff in expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline py-1 text-xs" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold text-navy-800">{monthLabel(month)}</span>
          <button className="btn-outline py-1 text-xs" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          <button className="btn-primary py-1.5 text-xs" onClick={() => { setEditing("new"); setForm(blank); }}><FiPlus /> Add staff</button>
        </div>
      </div>

      {editing && (
        <div className="border-b border-brand-100 bg-brand-50/50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div><label className="label">Role</label><input className="input" placeholder="e.g. Office agent" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} /></div>
            <div><label className="label">Pay (£)</label><input className="input" type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} /></div>
            <div><label className="label">Paid</label>
              <select className="input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                <option value="monthly">Monthly</option><option value="weekly">Weekly</option>
              </select>
            </div>
            <div><label className="label">Pay day (of month)</label><input className="input" type="number" min="1" max="31" placeholder="e.g. 28" value={form.payDay} onChange={(e) => setForm((f) => ({ ...f, payDay: e.target.value }))} /></div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-outline py-1.5 text-xs" onClick={() => setEditing(null)}><FiX /> Cancel</button>
            <button className="btn-primary py-1.5 text-xs" onClick={save}><FiCheckCircle /> Save</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="p-6 text-center text-sm text-navy-400">Loading…</p>
      ) : !active.length ? (
        <p className="p-6 text-center text-sm text-navy-400">No staff added yet. Add each person on salary (not engineers — they&rsquo;re paid per job) and record their pay here each month.</p>
      ) : (
        <>
          <ul className="divide-y divide-navy-100">
            {active.map((s) => {
              const paid = paidIn.get(s.id) || [];
              const paidSum = paid.reduce((a, e) => a + (Number(e.amount) || 0), 0);
              const owed = Math.max(0, Math.round((due(s) - paidSum) * 100) / 100);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">{s.name}{s.role ? <span className="font-normal text-navy-500"> · {s.role}</span> : null}</p>
                    <p className="text-xs text-navy-500">{gbp(s.salary)} {s.frequency === "weekly" ? "a week" : "a month"}{s.payDay ? ` · paid on the ${ord(Number(s.payDay))}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${owed === 0 ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}`}>
                    {owed === 0 ? `Paid ${gbp(paidSum)}` : paidSum > 0 ? `${gbp(paidSum)} paid · ${gbp(owed)} to go` : `${gbp(due(s))} not paid yet`}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {owed > 0 && <button className="btn-primary py-1 text-xs" onClick={() => pay(s)}>Record {s.frequency === "weekly" ? "week's pay" : "salary"}</button>}
                    <button className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600" title="Edit" onClick={() => { setEditing(s.id); setForm({ ...blank, ...s, salary: String(s.salary), payDay: s.payDay ? String(s.payDay) : "" }); }}><FiEdit2 className="h-3.5 w-3.5" /></button>
                    <button className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-rose-600" title="Left the company — past pay stays in expenses" onClick={() => persist(staff.map((x) => (x.id === s.id ? { ...x, active: false, leftOn: ukToday() } : x)))}><FiUserMinus className="h-3.5 w-3.5" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-navy-100 px-5 py-3 text-xs text-navy-500">
            {monthLabel(month)}: <strong className="text-navy-800">{gbp(totalPaid)}</strong> paid of <strong className="text-navy-800">{gbp(totalDue)}</strong> in salaries{totalDue - totalPaid > 0.005 ? ` · ${gbp(totalDue - totalPaid)} still to pay` : " · everyone paid"}.
          </p>
        </>
      )}
    </div>
  );
}
