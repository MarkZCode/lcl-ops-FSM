// Address suggestions for the address boxes (components/AddressInput.js).
//
// Free OpenStreetMap data (Photon, by komoot) — no account or key. It knows
// every street and its postcode, but many London buildings have no house
// number in it, so a typed house/flat number is kept at the front of each
// suggestion ("45 Trafalgar Road, London SE10 9UB"). When the postcode is
// already known, results are steered towards it. Only the typed text and the
// postcode are sent.
import { NextResponse } from "next/server";
import { rateLimitOr429 } from "@/lib/rateLimit";

const UK_BBOX = "-8.7,49.8,1.9,60.9";

export async function GET(request) {
  const limited = rateLimitOr429("address", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 120);
  const postcode = String(url.searchParams.get("postcode") || "").trim().toUpperCase().slice(0, 10);
  if (q.length < 3) return NextResponse.json({ results: [] });

  // A leading house/flat number ("45", "Flat 3, 12", "12A") the data may lack.
  const lead = (q.match(/^((flat|apartment|unit)\s*\w+,?\s*)?\d+[a-z]?\b,?/i) || [""])[0].replace(/,\s*$/, "").trim();

  // Search on the street part only — a flat or house number the map data
  // doesn't hold just confuses it. Steered to the postcode, else London.
  // Short forms spelled out ("Bury St" otherwise finds Bury St Edmunds).
  const ABBR = { st: "Street", rd: "Road", ave: "Avenue", ln: "Lane", sq: "Square", cres: "Crescent", ct: "Court", gdns: "Gardens", pl: "Place", tce: "Terrace", cl: "Close", dr: "Drive", gr: "Grove", hse: "House" };
  const streetQ = (q.slice(lead.length).replace(/^[\s,]+/, "") || q).replace(/\b(st|rd|ave|ln|sq|cres|ct|gdns|pl|tce|cl|dr|gr|hse)\b\.?/gi, (m, w) => ABBR[w.toLowerCase()]);
  let bias = "&lat=51.507&lon=-0.128&zoom=10&location_bias_scale=0.4";
  if (postcode) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { next: { revalidate: 86400 } });
      const d = await r.json();
      if (d?.result?.latitude) bias = `&lat=${d.result.latitude}&lon=${d.result.longitude}&zoom=16&location_bias_scale=0.6`;
    } catch {}
  }

  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(streetQ)}&limit=15&lang=en&bbox=${UK_BBOX}${bias}`, {
      headers: { "User-Agent": "LCL-Ops/1.0 (landlordcompliancelondon.uk)" },
    });
    const d = await r.json();
    const seen = new Set();
    const results = [];
    for (const f of d?.features || []) {
      const p = f.properties || {};
      if (p.countrycode && p.countrycode !== "GB") continue;
      if (!["house", "street", "building"].includes(p.type) && !p.street) continue;
      const street = p.street || (p.type === "street" ? p.name : "");
      if (!street) continue;
      const number = p.housenumber || "";
      const first = number && !lead ? `${number} ${street}` : lead ? `${lead} ${street}` : street;
      const named = p.type !== "street" && p.name && !p.name.includes(street) && !first.includes(p.name) ? p.name : "";
      const town = p.city || p.district || p.county || "";
      const label = [named, first, town].filter(Boolean).join(", ");
      const pc = String(p.postcode || "").toUpperCase();
      const key = `${label}|${pc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ label, postcode: pc, exact: !!number });
      if (results.length >= 8) break;
    }
    // Ones in the postcode already chosen come first.
    if (postcode) results.sort((a, b) => (b.postcode.replace(/\s/g, "") === postcode.replace(/\s/g, "")) - (a.postcode.replace(/\s/g, "") === postcode.replace(/\s/g, "")));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
