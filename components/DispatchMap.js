"use client";

// The day on a map: one numbered pin per visit, coloured by engineer, joined
// in time order. Postcodes are looked up with postcodes.io (the postcode
// only is sent) and drawn on OpenStreetMap. Pins sit on the postcode, not
// the exact door.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export const MAP_COLOURS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#6d28d9", "#15803d", "#c2410c", "#334155"];
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// stops: [{ id, jobId, postcode, label, time, engineerId, engineerName, colour, n }]
export default function DispatchMap({ stops = [] }) {
  const el = useRef(null);
  const [state, setState] = useState("loading");
  const [live, setLive] = useState(0);
  const key = stops.map((s) => `${s.id}|${s.postcode}|${s.engineerId}|${s.n}`).join(",");

  useEffect(() => {
    let map = null;
    let off = false;
    let timer = null;
    const withPc = stops.filter((s) => s.postcode);
    if (!withPc.length) { setState("empty"); return; }
    setState("loading");
    (async () => {
      try {
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css"; link.rel = "stylesheet"; link.href = "/leaflet/leaflet.css";
          document.head.appendChild(link);
        }
        const [{ default: L }, res] = await Promise.all([
          import("leaflet"),
          fetch("https://api.postcodes.io/postcodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postcodes: [...new Set(withPc.map((s) => s.postcode))] }),
          }).then((r) => r.json()),
        ]);
        if (off || !el.current) return;
        const at = {};
        for (const r of res.result || []) if (r.result) at[r.query] = [r.result.latitude, r.result.longitude];
        const placed = withPc.filter((s) => at[s.postcode]);
        if (!placed.length) { setState("none"); return; }
        map = L.map(el.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
        const lines = {};
        // Two visits at one postcode would sit on top of each other — nudge.
        const used = {};
        for (const s of placed) {
          const k = at[s.postcode].join(",");
          const i = (used[k] = (used[k] || 0) + 1) - 1;
          const pos = [at[s.postcode][0] + i * 0.0004, at[s.postcode][1] + i * 0.0006];
          L.marker(pos, {
            icon: L.divIcon({
              className: "",
              iconSize: [26, 26],
              iconAnchor: [13, 13],
              html: `<span style="display:flex;height:26px;width:26px;align-items:center;justify-content:center;border-radius:9999px;background:${s.colour};color:#fff;font:700 12px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${s.n}</span>`,
            }),
          }).addTo(map).bindPopup(`<strong>${esc(s.time)} · ${esc(s.engineerName)}</strong><br>${esc(s.label)}<br>${esc(s.postcode)}<br><a href="/jobs/${encodeURIComponent(s.jobId)}">Open ${esc(s.jobId)}</a>`);
          (lines[s.engineerId] = lines[s.engineerId] || { colour: s.colour, pts: [] }).pts.push(pos);
        }
        for (const l of Object.values(lines)) if (l.pts.length > 1) L.polyline(l.pts, { color: l.colour, weight: 3, opacity: 0.6, dashArray: "6 6" }).addTo(map);
        // Engineers who pressed "On my way" on their job link — where their
        // phone last was, refreshed every minute while the map is open.
        const liveLayer = L.layerGroup().addTo(map);
        const drawLive = async () => {
          if (!supabase) return;
          const { data } = await supabase.from("app_settings").select("data").eq("id", "engineer_live").maybeSingle();
          if (off) return;
          liveLayer.clearLayers();
          const fresh = Object.entries(data?.data || {}).filter(([, v]) => Date.now() - new Date(v?.at || 0).getTime() < 20 * 60_000);
          for (const [eid, v] of fresh) {
            const colour = stops.find((s) => s.engineerId === eid)?.colour || "#111827";
            const mins = Math.max(0, Math.round((Date.now() - new Date(v.at).getTime()) / 60_000));
            L.marker([v.lat, v.lng], {
              zIndexOffset: 1000,
              icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: `<span style="display:block;height:22px;width:22px;border-radius:9999px;background:${colour};border:3px solid #fff;box-shadow:0 0 0 4px ${colour}55,0 1px 4px rgba(0,0,0,.4)"></span>` }),
            }).addTo(liveLayer).bindPopup(`<strong>${esc(v.name || "Engineer")}</strong><br>On the way to ${esc(v.jobId || "")}<br>Seen ${mins === 0 ? "just now" : `${mins} min ago`}`);
          }
          setLive(fresh.length);
        };
        drawLive().catch(() => {});
        timer = setInterval(() => drawLive().catch(() => {}), 60_000);
        map.fitBounds(L.latLngBounds(Object.values(lines).flatMap((l) => l.pts)).pad(0.2), { maxZoom: 14 });
        setState(placed.length < stops.length ? `${stops.length - placed.length} not shown — no postcode, or it couldn't be found.` : "ok");
      } catch {
        if (!off) setState("error");
      }
    })();
    return () => { off = true; if (timer) clearInterval(timer); if (map) map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const engineers = [...new Map(stops.map((s) => [s.engineerId, s])).values()];
  const note = { loading: "Loading the map…", empty: "Nothing with a postcode is booked for this day.", none: "None of the day's postcodes could be found.", error: "The map couldn't be loaded — check your connection.", ok: "" }[state] ?? state;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-navy-100 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      {state !== "empty" && state !== "none" && state !== "error" && <div ref={el} className="h-[340px] w-full sm:h-[420px]" style={{ zIndex: 0 }} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-navy-600 dark:text-slate-300">
        {engineers.map((e) => (
          <span key={e.engineerId} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.colour }} /> {e.engineerName}
          </span>
        ))}
        {note && <span className="text-navy-400">{note}</span>}
        <span className="ml-auto text-[11px] text-navy-400">{live > 0 ? `${live} engineer${live === 1 ? "" : "s"} sharing location (ringed dot). ` : ""}Pins are on the postcode, numbered in time order.</span>
      </div>
    </div>
  );
}
