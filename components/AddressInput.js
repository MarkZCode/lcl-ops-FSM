"use client";

// An address box that suggests real addresses as you type ("45 Trafalgar",
// "Flat 3, 12 Bury St"). Picking one fills the address and, if it's empty,
// the postcode. Suggestions come from /api/address (free map data — every
// street is there, house numbers only sometimes, so the number you type is
// kept), or — with an Ideal Postcodes key — exact Royal Mail addresses down
// to the flat. You can always just type the address and ignore the list.
import { useEffect, useRef, useState } from "react";

export default function AddressInput({ value, onChange, onPick, postcode = "", className = "input", placeholder = "Address", ...rest }) {
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = String(value || "").trim();
    if (!open || q.length < 3) { setOptions([]); setBusy(false); return; }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(q)}&postcode=${encodeURIComponent(postcode || "")}`);
        const d = await r.json();
        if (mine === seq.current) { setOptions(Array.isArray(d?.results) ? d.results : []); setActive(-1); setBusy(false); }
      } catch {
        if (mine === seq.current) { setOptions([]); setBusy(false); }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, open, postcode]);

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // An exact (Royal Mail) suggestion is fetched in full on pick — its lines
  // and postcode; the free kind already carries what it has.
  const pick = async (o) => {
    setOpen(false);
    setOptions([]);
    let chosen = o;
    if (o.udprn) {
      try {
        const r = await fetch(`/api/address?udprn=${encodeURIComponent(o.udprn)}`);
        const d = await r.json();
        if (d?.address) chosen = d.address;
      } catch {}
    }
    onChange(chosen.label);
    onPick?.(chosen);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        {...rest}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(options[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-autocomplete="list"
      />
      {open && !options.length && String(value || "").trim().length < 3 && (
        <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs text-navy-500 shadow-lg dark:bg-[#141414]">
          Type the house number and street — e.g. 45 Trafalgar Road — then pick the address
        </p>
      )}
      {open && !options.length && busy && (
        <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs text-navy-500 shadow-lg dark:bg-[#141414]">Looking up addresses…</p>
      )}
      {open && options.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-navy-200 bg-white py-1 text-sm shadow-lg dark:bg-[#141414]">
          {options.map((o, i) => (
            <li key={`${o.label}|${o.postcode}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-brand-50 ${i === active ? "bg-brand-50" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              >
                <span className="truncate font-medium text-navy-800">{o.label}</span>
                {o.postcode && <span className="shrink-0 text-xs font-semibold text-navy-500">{o.postcode}</span>}
              </button>
            </li>
          ))}
          <li className="border-t border-navy-100 px-3 py-1.5 text-[11px] text-navy-400">Not listed? Just type the address.</li>
        </ul>
      )}
    </div>
  );
}
