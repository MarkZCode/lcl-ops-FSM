"use client";

// The app's one search box. Types ahead across every collection in the FSM
// (jobs, clients, engineers, prospects, leads, engineer recruits) and jumps
// straight to the record — see lib/search.js for the matching itself.
//
// It replaces a box that only ever redirected to /jobs?q=…, which meant the
// 14,000 prospects and 42,000 leads had no way in from here at all.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LuSearch, LuLoader } from "react-icons/lu";
import { useStore } from "@/lib/store";
import { globalSearch } from "@/lib/search";

const GROUP_TONE = {
  jobs: "bg-brand-50 text-brand-700",
  clients: "bg-blue-50 text-blue-700",
  engineers: "bg-amber-50 text-amber-700",
  prospects: "bg-purple-50 text-purple-700",
  leads: "bg-sky-50 text-sky-700",
  recruits: "bg-navy-100 text-navy-700",
};

export default function GlobalSearch({ className = "", placeholder = "Search anything — jobs, clients, leads, prospects…" }) {
  const router = useRouter();
  const {
    jobs, clients, engineers, prospects, coldLeads, recruits, clientById,
    prospectsReady, coldLeadsReady, requestBigTables,
  } = useStore();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Typing is cheap but scanning 58k records on EVERY keystroke isn't, so the
  // term the search actually runs on lags the input by a beat.
  const [debounced, setDebounced] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 160);
    return () => clearTimeout(t);
  }, [q]);

  const results = useMemo(
    () => globalSearch(debounced, { jobs, clients, engineers, prospects, coldLeads, recruits, clientById }),
    [debounced, jobs, clients, engineers, prospects, coldLeads, recruits, clientById]
  );

  // One flat list behind the grouped display, so ↑/↓ walk the whole thing.
  const flat = useMemo(
    () => results.groups.flatMap((g) => g.items.map((item) => ({ item, group: g }))),
    [results]
  );

  useEffect(() => setActive(0), [debounced]);

  // Close on outside click — the panel overlays the page, so leaving it open
  // after you've clicked away just gets in the way.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // ⌘K / Ctrl-K from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (entry) => {
    if (!entry) return;
    setOpen(false);
    setQ("");
    setDebounced("");
    router.push(entry.group.href(entry.item));
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!flat.length) {
      // Nothing matched but the operator pressed Enter — fall back to the
      // jobs list rather than swallowing the keystroke.
      if (e.key === "Enter" && q.trim()) {
        setOpen(false);
        router.push(`/jobs?q=${encodeURIComponent(q.trim())}`);
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
  };

  const showPanel = open && debounced.trim().length >= 2;
  const stillLoading = !prospectsReady || !coldLeadsReady;
  let cursor = -1;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" />
      {/* Colours come from the design-system classes — globals.css remaps
          navy-* onto the surface/hairline/text tokens per theme. Hand-rolled
          `dark:` overrides bypassed that remap, which is what left this bar
          reading blue against the neutral near-black chrome. */}
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          const val = e.target.value;
          setQ(val);
          setOpen(true);
          if (val.trim().length >= 2) requestBigTables();
        }}
        onFocus={() => { setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Search everything"
        className="h-10 w-full rounded-full border border-navy-200 pl-10 pr-16 text-sm text-navy-900 outline-none transition-colors placeholder:text-navy-500 focus:border-brand-400"
        style={{ backgroundColor: "var(--surface-card)" }}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-navy-200 px-1.5 py-0.5 text-[10px] font-semibold text-navy-500 sm:block">
        ⌘K
      </kbd>

      {showPanel && (
        <div
          className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-navy-200 shadow-xl"
          style={{ backgroundColor: "var(--surface-card)" }}
        >
          {flat.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-navy-500">
                Nothing matches &ldquo;{debounced.trim()}&rdquo;.
              </p>
              {stillLoading && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-navy-400">
                  <LuLoader className="h-3 w-3 animate-spin" /> Prospects and leads are still loading — try again in a moment.
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="border-b border-navy-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                {results.total} match{results.total === 1 ? "" : "es"}
                {stillLoading && " · prospects/leads still loading"}
              </p>
              {results.groups.map((g) => (
                <div key={g.key}>
                  <p className="sticky top-0 bg-navy-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                    {g.label}
                    <span className="ml-1.5 font-normal normal-case text-navy-400">
                      {g.total > g.items.length ? `${g.items.length} of ${g.total}${g.total >= 40 ? "+" : ""}` : g.total}
                    </span>
                  </p>
                  {g.items.map((item) => {
                    cursor += 1;
                    const idx = cursor;
                    return (
                      <button
                        key={`${g.key}-${item.id}`}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go({ item, group: g })}
                        className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                          idx === active ? "bg-brand-50" : "hover:bg-navy-50"
                        }`}
                      >
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${GROUP_TONE[g.key] || "bg-navy-100 text-navy-600"}`}>
                          {g.label.slice(0, 3)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-navy-900">
                            {item.title}
                          </span>
                          {(item.subtitle || item.meta) && (
                            <span className="block truncate text-xs text-navy-500">
                              {[item.subtitle, item.meta].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        {item.status && (
                          <span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase text-navy-400">
                            {String(item.status).replace(/_/g, " ")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
