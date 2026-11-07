"use client";

// A postcode box that offers real postcodes as you type. Start typing
// ("SE10 9") and the matching postcodes drop down to pick from, so a
// postcode is chosen rather than typed out and mistyped. Uses postcodes.io,
// which is free and needs no account — only the letters typed are sent.
// It lists POSTCODES, not street addresses: the address line is still typed.
import { useEffect, useRef, useState } from "react";

export default function PostcodeInput({ value, onChange, onPick, className = "input", placeholder = "Postcode", ...rest }) {
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = String(value || "").trim();
    if (!open || q.replace(/\s/g, "").length < 2) { setOptions([]); setBusy(false); return; }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}/autocomplete?limit=8`);
        const d = await r.json();
        if (mine === seq.current) { setOptions(Array.isArray(d?.result) ? d.result : []); setActive(-1); setBusy(false); }
      } catch {
        if (mine === seq.current) { setOptions([]); setBusy(false); }
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const pick = (pc) => {
    onChange(pc);
    onPick?.(pc);
    setOpen(false);
    setOptions([]);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        {...rest}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
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
        aria-controls="postcode-listbox"
        aria-autocomplete="list"
      />
      {/* Before there's a list, say how it works — the box looked like a
          plain text field and nobody knew postcodes could be picked. */}
      {open && !options.length && (() => {
        const typed = String(value || "").replace(/\s/g, "").length;
        const exact = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(String(value || "").trim());
        if (exact) return null;
        const msg = typed < 2 ? "Start typing the postcode — e.g. SE10 9 — then pick it from the list" : busy ? "Looking up postcodes…" : "No postcode starts like that — check it";
        return <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs text-navy-500 shadow-lg dark:bg-[#141414]">{msg}</p>;
      })()}
      {open && options.length > 0 && (
        <ul id="postcode-listbox" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-navy-200 bg-white py-1 text-sm shadow-lg dark:bg-[#141414]">
          {options.map((pc, i) => (
            <li key={pc} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left font-medium text-navy-800 hover:bg-brand-50 ${i === active ? "bg-brand-50" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pick(pc); }}
              >
                {pc}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
