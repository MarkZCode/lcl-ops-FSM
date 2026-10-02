"use client";

// The day on a map of London.
//
// The map always opens on the whole of Greater London out to the M25, so
// where the day's jobs sit is read against the city, not against each other.
// Every job is a glowing dot in its engineer's colour (red = no engineer
// yet), numbered in the order they'll be visited, and each engineer's jobs
// are joined up with the distance written on every leg — so a far-apart
// pair is obvious before it is assigned, not after.
//
// Postcodes are looked up with postcodes.io (only the postcode is sent) and
// drawn on OpenStreetMap. Dots sit on the postcode, not the exact door, and
// distances are straight lines — a guide to the gaps, not a sat-nav figure.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export const MAP_COLOURS = ["#0f766e", "#1d4ed8", "#b45309", "#6d28d9", "#15803d", "#0e7490", "#a16207", "#334155"];
export const UNASSIGNED_COLOUR = "#e11d48";
// Greater London, just outside the M25.
const LONDON = [[51.255, -0.56], [51.72, 0.34]];
const FAR_MILES = 8;

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const miles = (a, b) => {
  const R = 3958.8, rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const STYLE = `
@keyframes lcl-glow { 0% { transform: scale(0.6); opacity: 0.75; } 100% { transform: scale(2.3); opacity: 0; } }
.lcl-dot { position: relative; display: block; height: 26px; width: 26px; }
/* A quiet map, so the jobs are what you see: the streets go grey in light
   mode and dark in dark mode; the dots keep their colour. */
.lcl-map .leaflet-tile-pane { filter: grayscale(0.9) contrast(0.9) brightness(1.06); }
.dark .lcl-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) grayscale(0.7) brightness(0.85) contrast(0.95); }
.dark .lcl-map { background: #0b0b0c; }
.lcl-dot i { position: absolute; inset: 0; border-radius: 9999px; background: var(--c); animation: lcl-glow 1.9s ease-out infinite; }
.lcl-dot b { position: absolute; inset: 3px; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: var(--c); color: #fff; font: 700 11px system-ui; border: 2px solid #fff; box-shadow: 0 0 10px 2px var(--c), 0 1px 4px rgba(0,0,0,.4); }
.lcl-leg { background: rgba(255,255,255,.94); border-radius: 9999px; padding: 1px 7px; font: 700 10.5px system-ui; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,.3); transform: translate(-50%, -50%); width: max-content; }
@media (prefers-reduced-motion: reduce) { .lcl-dot i { animation: none; opacity: .25; transform: scale(1.6); } }
`;

// stops: [{ id, jobId, postcode, label, time, engineerId, engineerName, colour, n }]
export default function DispatchMap({ stops = [] }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  // Tap a name under the map to zoom to that engineer's jobs; "All of
  // London" goes back out.
  const focus = (eid) => {
    const m = mapRef.current;
    if (!m) return;
    const pts = eid ? m.routes[eid]?.pts : null;
    if (pts?.length) m.map.fitBounds(m.L.latLngBounds(pts).pad(0.35), { maxZoom: 14 });
    else {
      const b = m.L.latLngBounds(LONDON);
      for (const r of Object.values(m.routes)) for (const p of r.pts) b.extend(p);
      m.map.fitBounds(b, { padding: [12, 12] });
    }
  };
  const [state, setState] = useState("loading");
  const [legs, setLegs] = useState({});   // engineerId → { miles, far }
  const [live, setLive] = useState(0);
  const key = stops.map((s) => `${s.id}|${s.postcode}|${s.engineerId}|${s.n}`).join(",");

  useEffect(() => {
    let map = null;
    let off = false;
    let timer = null;
    setState("loading");
    (async () => {
      try {
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css"; link.rel = "stylesheet"; link.href = "/leaflet/leaflet.css";
          document.head.appendChild(link);
        }
        if (!document.getElementById("lcl-map-style")) {
          const st = document.createElement("style");
          st.id = "lcl-map-style"; st.textContent = STYLE;
          document.head.appendChild(st);
        }
        const withPc = stops.filter((s) => s.postcode);
        const [{ default: L }, res] = await Promise.all([
          import("leaflet"),
          withPc.length
            ? fetch("https://api.postcodes.io/postcodes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postcodes: [...new Set(withPc.map((s) => s.postcode))] }),
              }).then((r) => r.json())
            : Promise.resolve({ result: [] }),
        ]);
        if (off || !el.current) return;
        const at = {};
        for (const r of res.result || []) if (r.result) at[r.query] = [r.result.latitude, r.result.longitude];
        const placed = withPc.filter((s) => at[s.postcode]);

        map = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.25 });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

        const routes = {};
        const used = {};
        for (const s of placed) {
          // Two jobs at one postcode would sit on top of each other — nudge.
          const k = at[s.postcode].join(",");
          const i = (used[k] = (used[k] || 0) + 1) - 1;
          const pos = [at[s.postcode][0] + i * 0.0012, at[s.postcode][1] + i * 0.0018];
          L.marker(pos, {
            icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<span class="lcl-dot" style="--c:${s.colour}"><i></i><b>${s.n}</b></span>` }),
          }).addTo(map).bindPopup(`<strong>${esc(s.time)} · ${esc(s.engineerName)}</strong><br>${esc(s.label)}<br>${esc(s.postcode)}${s.noLink ? `<br>${esc(s.jobId)}` : `<br><a href="/jobs/${encodeURIComponent(s.jobId)}">Open ${esc(s.jobId)}</a>`}`);
          (routes[s.engineerId] = routes[s.engineerId] || { colour: s.colour, pts: [] }).pts.push(pos);
        }

        // Join each engineer's jobs in visiting order, with the miles on each leg.
        const summary = {};
        for (const [eid, r] of Object.entries(routes)) {
          if (eid === "unassigned" || eid === "tray" || r.pts.length < 2) { summary[eid] = { miles: 0, far: 0 }; continue; }
          L.polyline(r.pts, { color: r.colour, weight: 3, opacity: 0.75, dashArray: "2 7", lineCap: "round" }).addTo(map);
          let total = 0, far = 0;
          for (let i = 1; i < r.pts.length; i++) {
            const d = miles(r.pts[i - 1], r.pts[i]);
            total += d;
            if (d >= FAR_MILES) far++;
            const mid = [(r.pts[i - 1][0] + r.pts[i][0]) / 2, (r.pts[i - 1][1] + r.pts[i][1]) / 2];
            L.marker(mid, { interactive: false, zIndexOffset: -500, icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<span class="lcl-leg" style="color:${d >= FAR_MILES ? UNASSIGNED_COLOUR : r.colour}">${d.toFixed(1)} mi</span>` }) }).addTo(map);
          }
          summary[eid] = { miles: total, far };
        }
        setLegs(summary);

        // Always the whole of London; widened only if a job lies outside it.
        const bounds = L.latLngBounds(LONDON);
        for (const r of Object.values(routes)) for (const p of r.pts) bounds.extend(p);
        map.fitBounds(bounds, { padding: [12, 12] });

        // Engineers who pressed "On my way" on their job link.
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
              icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<span style="display:block;height:18px;width:18px;border-radius:4px;transform:rotate(45deg);background:${colour};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)"></span>` }),
            }).addTo(liveLayer).bindPopup(`<strong>${esc(v.name || "Engineer")}</strong><br>On the way to ${esc(v.jobId || "")}<br>Seen ${mins === 0 ? "just now" : `${mins} min ago`}`);
          }
          setLive(fresh.length);
        };
        drawLive().catch(() => {});
        timer = setInterval(() => drawLive().catch(() => {}), 60_000);

        const lost = stops.filter((s) => !placed.includes(s));
        setState(!stops.length ? "empty" : lost.length ? `Not on the map — no postcode, or it couldn't be found: ${lost.map((s) => s.jobId).slice(0, 6).join(", ")}${lost.length > 6 ? "…" : ""}.` : "ok");
        mapRef.current = { map, L, routes };
      } catch {
        if (!off) setState("error");
      }
    })();
    return () => { off = true; mapRef.current = null; if (timer) clearInterval(timer); if (map) map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // One line per engineer: how many jobs, how far between them.
  const people = [...new Map(stops.map((s) => [s.engineerId, s])).values()].map((s) => ({
    ...s,
    count: stops.filter((x) => x.engineerId === s.engineerId).length,
    ...(legs[s.engineerId] || { miles: 0, far: 0 }),
  }));
  const note = { loading: "Loading the map…", empty: "Nothing booked for this day.", error: "The map couldn't be loaded — check your connection.", ok: "" }[state] ?? state;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-navy-100 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      {state !== "error" && <div ref={el} className="lcl-map h-[360px] w-full sm:h-[460px]" style={{ zIndex: 0 }} />}
      <div className="space-y-1.5 px-3 py-2.5 text-xs text-navy-700 dark:text-slate-300">
        {people.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.engineerId} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-navy-50 dark:hover:bg-white/5" onClick={() => focus(p.engineerId)} title="Zoom to these jobs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.colour, boxShadow: `0 0 6px 1px ${p.colour}` }} />
                <span className="min-w-0 truncate font-semibold text-navy-900 dark:text-white">{p.engineerName}</span>
                <span className="shrink-0 text-navy-500 dark:text-slate-400">
                  {p.count} job{p.count === 1 ? "" : "s"}
                  {!["unassigned", "tray"].includes(p.engineerId) && p.count > 1 && p.miles > 0 ? ` · ${p.miles.toFixed(1)} mi between them` : ""}
                </span>
                {p.far > 0 && <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{p.far} far apart</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-navy-400">
          <button type="button" className="mr-2 font-semibold text-brand-600 hover:underline" onClick={() => focus(null)}>All of London</button>
          {note ? `${note} ` : ""}{live > 0 ? `${live} engineer${live === 1 ? "" : "s"} sharing location (diamond). ` : ""}
          Dots are on the postcode, numbered in visiting order; distances are straight lines. Red = no engineer yet, grey ? = accepted but not booked.
        </p>
      </div>
    </div>
  );
}
