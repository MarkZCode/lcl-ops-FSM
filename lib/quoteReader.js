// Reading what a client wrote into the numbers a quote is priced on.
//
// The old reader took the FIRST "N bed" it saw and stopped. A real enquiry
// said "2 bedrooms downstairs and 3 bedrooms upstairs" and was quoted as a
// 1–3 bedroom EICR — the house has five. It also matched "2 Bedford Road"
// as two bedrooms. This reads every mention, works out how they relate
// (floors of one house, separate flats, a range the client wasn't sure
// about, a correction), and says in plain words what it assumed so the
// person checking the quote knows exactly which parts are guesses.
//
// A person always checks the quote before it goes out. The aim here is that
// the draft is right as often as possible, and that when it can't be sure it
// says so instead of quietly picking a number.
//
// Pure — no network, no store.
import { SERVICE_CATALOG } from "./constants";

const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUM = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const toNum = (s) => {
  if (s == null) return null;
  const k = String(s).toLowerCase();
  if (k in WORD_NUM) return WORD_NUM[k];
  const n = Number(k);
  return Number.isFinite(n) ? n : null;
};

// "bed", "beds", "bedroom", "bedrooms", "bedroomed", "bdrm" — always ending
// on a word boundary, so "Bedford" and "bedside" don't count.
const BED = "(?:bed(?:room(?:ed)?|rm)?s?|bdrms?|bdr)\\b";
const SIZE_ADJ = "(?:(?:double|single|good[- ]sized|large|small|big|en[- ]?suite)\\s+)?";

const FLOOR_RE = /\b(down\s?stairs|up\s?stairs|ground(?:\s+floor)?|lower\s+ground|first\s+floor|1st\s+floor|second\s+floor|2nd\s+floor|third\s+floor|3rd\s+floor|top\s+floor|basement|loft|attic|on\s+each\s+floor)\b/i;
const UNIT_RE = /\b(flats?|apartments?|maisonettes?|units?|studios?|annexe?|granny\s+flat|bedsits?)\b/i;
const HOUSE_RE = /\b(house|home|bungalow|cottage|semi|terrace|terraced|detached|townhouse)\b/i;
const SEPARATE_RE = /\b(separate|self[- ]contained|each\s+(?:flat|unit|apartment|property)|both\s+(?:flats|units|apartments|properties)|two\s+(?:flats|units|apartments|properties)|(?:flats|apartments|units|properties)\b|block\s+of|converted\s+into)\b/i;
const TOTAL_RE = /\b(total(?:\s+of)?|in\s+total|altogether|overall|combined|all\s+together)\b/i;
const UNSURE_RE = /\b(maybe|possibly|might\s+be|i\s+think|not\s+sure|around|about|approx(?:imately)?|roughly|or\s+so)\b/i;
const CORRECTION_RE = /\b(actually|sorry|correction|i\s+mean|i\s+meant|not\s+\d|rather|now\s+(?:a|it'?s)|was\s+\d)\b/i;
const COMMERCIAL_RE = /\b(shop|office|offices|restaurant|caf[eé]|salon|warehouse|retail|takeaway|pub|hotel|school|nursery|church|clinic|surgery|gym|factory|workshop|business\s+premises|commercial\s+(?:unit|premises|property)|showroom|hall)\b/i;
const HMO_RE = /\b(hmo|house\s+in\s+multiple\s+occupation|house\s*share|rooms?\s+(?:are\s+)?let|lettable\s+rooms?)\b/i;
const COMMUNAL_RE = /\b(communal|common\s+(?:areas?|parts)|stairwells?|landings?|block\s+of\s+flats|hallways?)\b/i;
const NO_GAS_RE = /\b(no\s+gas|not?\s+(?:have|got)\s+(?:any\s+)?gas|all[- ]electric|fully\s+electric|electric\s+only|no\s+gas\s+supply)\b/i;

// The sentence (or line) a match sits in — context is read within it, never
// across a full stop, so "...a 3 bed flat. The house next door..." doesn't
// mix the two.
function sentenceAround(text, start, end) {
  let a = start, b = end;
  while (a > 0 && !/[.!?\n;]/.test(text[a - 1])) a--;
  while (b < text.length && !/[.!?\n;]/.test(text[b])) b++;
  return text.slice(a, b);
}

// ── Bedrooms ─────────────────────────────────────────────────────────────
// Every bedroom mention, with what surrounds it.
export function bedroomMentions(raw) {
  const text = String(raw || "");
  const out = [];
  // "3 bed", "3-bed", "three bedroom", "2-3 bed", "2/3 bed", "2 or 3 bed",
  // "3 double bedrooms"
  const before = new RegExp(`\\b${NUM}(?:\\s*(?:-|–|to|or|\\/)\\s*${NUM})?\\s*-?\\s*${SIZE_ADJ}${BED}`, "gi");
  let m;
  while ((m = before.exec(text))) {
    const a = toNum(m[1]);
    const b = toNum(m[2]);
    if (a == null || a > 12 || (b != null && b > 12)) continue;
    const pre = text.slice(Math.max(0, m.index - 14), m.index);
    const post = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    // "2 x 3 bed flats", "2× 3-bed" — a count of units of this size
    const times = pre.match(new RegExp(`${NUM}\\s*(?:x|×|\\*)\\s*$`, "i"));
    // "two 3 bed flats" — a count only when what follows is plural units
    const plainCount = !times && /\s*-?\s*(flats|apartments|units|houses|properties|maisonettes)\b/i.test(post)
      ? pre.match(new RegExp(`\\b${NUM}\\s+$`, "i"))
      : null;
    const count = toNum((times || plainCount || [])[1]);
    out.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      beds: b != null ? Math.max(a, b) : a,
      low: b != null ? Math.min(a, b) : a,
      range: b != null && a !== b,
      count: count && count <= 50 ? count : null,
    });
  }
  // "Bedrooms: 3", "No. of bedrooms - 3", "beds = 4" (form-style)
  const after = new RegExp(`\\b(?:no\\.?\\s*of\\s+|number\\s+of\\s+)?${BED}\\s*[:=\\-–]\\s*${NUM}\\b`, "gi");
  while ((m = after.exec(text))) {
    const n = toNum(m[1]);
    if (n == null || n > 12) continue;
    if (out.some((o) => m.index >= o.index && m.index < o.end)) continue;
    out.push({ index: m.index, end: m.index + m[0].length, text: m[0], beds: n, low: n, range: false, count: null });
  }
  out.sort((x, y) => x.index - y.index);
  // Context for each: from the previous mention's end to the next one's
  // start, inside the same sentence.
  out.forEach((o, i) => {
    const sentence = sentenceAround(text, o.index, o.end);
    const sStart = text.indexOf(sentence, Math.max(0, o.index - sentence.length));
    const lo = Math.max(sStart, i > 0 ? out[i - 1].end : 0);
    const hi = Math.min(sStart + sentence.length, i < out.length - 1 ? out[i + 1].index : text.length);
    o.context = text.slice(lo, hi);
    o.sentence = sentence;
    // The words AFTER a mention describe it ("3 bedrooms upstairs"); only
    // fall back to the words before when nothing follows ("upstairs, 3 bed").
    const behind = o.context.slice(o.end - lo);
    const ahead = o.context.slice(0, o.index - lo);
    o.floor = (behind.match(FLOOR_RE) || ahead.match(FLOOR_RE) || [])[1] || null;
    o.unit = (behind.match(UNIT_RE) || ahead.match(UNIT_RE) || [])[1] || null;
    o.total = TOTAL_RE.test(o.context);
    o.unsure = UNSURE_RE.test(o.context);
  });
  return out;
}

// How many separate dwellings the text describes without giving sizes:
// "block of 6 flats", "4 flats", "two self-contained units".
function unitCount(text) {
  const re = new RegExp(`\\b(?:block\\s+of\\s+)?${NUM}\\s+(?:self[- ]contained\\s+|separate\\s+|residential\\s+)?(flats|apartments|units|maisonettes|studios|houses|properties|bedsits)\\b`, "i");
  const m = text.match(re);
  if (!m) return null;
  const n = toNum(m[1]);
  return n && n >= 2 && n <= 100 ? { count: n, kind: m[2].toLowerCase() } : null;
}

// ── Counts used by the non-bedroom tiers ─────────────────────────────────
function firstCount(text, re, max = 500) {
  const m = text.match(re);
  if (!m) return null;
  const n = toNum(m[1]);
  return n != null && n >= 0 && n <= max ? n : null;
}

const GAS_ITEMS = [
  { label: "boiler", re: /\b(?:combi\s+|system\s+|back\s+|gas\s+)?boilers?\b/gi, always: true },
  { label: "hob", re: /\bhobs?\b/gi },
  { label: "cooker", re: /\b(?:range\s+)?cookers?\b/gi },
  { label: "oven", re: /\bovens?\b/gi },
  { label: "gas fire", re: /\bgas\s+fires?\b|\bfire\s*place\s+(?:on\s+)?gas\b/gi, always: true },
  { label: "water heater", re: /\b(?:gas\s+)?water\s+heaters?\b|\bmultipoint\b|\bgeyser\b/gi, always: true },
  { label: "warm air unit", re: /\bwarm\s+air\s+(?:unit|heater|heating)s?\b/gi, always: true },
];

// Gas appliances the client NAMED: "gas boiler and hob" → 2. A hob, cooker
// or oven only counts when gas is mentioned for it — an electric or
// induction hob isn't on a gas certificate.
function namedGasAppliances(text) {
  const found = [];
  for (const item of GAS_ITEMS) {
    item.re.lastIndex = 0;
    let m;
    let counted = 0;
    while ((m = item.re.exec(text))) {
      const pre = text.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
      if (/(electric|induction|ceramic|halogen)\s*(?:and\s+\w+\s*)?$/.test(pre)) continue;
      if (!item.always) {
        const sentence = sentenceAround(text, m.index, m.index + m[0].length).toLowerCase();
        if (!/\bgas\b/.test(sentence) || /\b(electric|induction)\s+(hob|cooker|oven)/.test(sentence) && !/gas\s+(hob|cooker|oven)/.test(sentence)) continue;
      }
      const n = toNum((pre.match(new RegExp(`${NUM}\\s*(?:x\\s*)?(?:gas\\s+|combi\\s+)?$`, "i")) || [])[1]);
      counted = Math.max(counted, n && n <= 10 ? n : 1);
    }
    if (counted) found.push({ label: item.label, n: counted });
  }
  // A cooker and an oven in one sentence are usually the same appliance.
  const cooker = found.find((f) => f.label === "cooker");
  const oven = found.find((f) => f.label === "oven");
  if (cooker && oven) found.splice(found.indexOf(oven), 1);
  return found;
}

export function readEnquiryText(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const lower = text.toLowerCase();
  const mentions = bedroomMentions(text);
  const r = {
    beds: null,          // one property's bedroom count, best reading
    bedsLow: null,       // when the client gave a range
    units: null,         // [{ beds, qty }] — separate dwellings
    unitCount: null,     // dwellings mentioned without sizes
    bedsHow: "",         // how the number was arrived at, in words
    bedsSure: true,
    studio: /\bstudio\b(?!\s+(?:road|rd|street|st|lane|way|close))/i.test(text),
    bedsit: /\bbedsits?\b/i.test(text),
    hmo: HMO_RE.test(text),
    commercialWords: (text.match(COMMERCIAL_RE) || [])[1] || null,
    communal: COMMUNAL_RE.test(text),
    noGas: NO_GAS_RE.test(text),
    extraRooms: (text.match(/\b(box\s?room|study|home\s+office|spare\s+room|loft\s+room|loft\s+conversion|nursery\s+room|dressing\s+room)\b/i) || [])[1] || null,
    gasExplicit: null,
    gasNamed: [],
    consumerUnits: null,
    patItems: null,
    emLights: null,
    alarms: null,
    extinguishers: null,
    floors: null,
    sqm: null,
  };

  // ── bedrooms ──
  const totals = mentions.filter((m) => m.total);
  const distinct = [...new Set(mentions.map((m) => m.beds))];
  const withUnitCount = mentions.filter((m) => m.count);
  if (withUnitCount.length) {
    // "2 x 3 bed flats and 1 x 2 bed flat"
    r.units = mentions.map((m) => ({ beds: m.beds, qty: m.count || 1 }));
    r.bedsHow = r.units.map((u) => `${u.qty} × ${u.beds}-bed`).join(" + ");
  } else if (totals.length) {
    const t = totals[totals.length - 1];
    r.beds = t.beds;
    r.bedsHow = `they said ${t.beds} bedrooms in total`;
    const parts = mentions.filter((m) => !m.total).map((m) => m.beds);
    const sum = parts.reduce((a, b) => a + b, 0);
    if (parts.length > 1 && sum !== t.beds) {
      r.bedsSure = false;
      r.bedsHow += ` (but the parts they listed add up to ${sum})`;
    }
  } else if (mentions.length === 1 || distinct.length === 1 && !mentions.some((m) => m.floor)) {
    const m = mentions[mentions.length - 1];
    r.beds = m.beds;
    if (m.range) {
      r.bedsLow = m.low;
      r.bedsHow = `they wrote "${m.text.trim()}" — priced at the larger size`;
    }
    if (m.unsure) r.bedsSure = false;
  } else if (mentions.length > 1) {
    const isFlat = (m) => m.unit && /flat|apartment|maisonette|unit|studio|annex|bedsit/i.test(m.unit);
    const eachUnit = mentions.every(isFlat);
    // "a three-bed and a two-bed flat" — the flat word only follows the last.
    const flatsNoHouse = mentions.some(isFlat) && !HOUSE_RE.test(text);
    const allFloors = mentions.every((m) => m.floor);
    // A correction is a "sorry / actually / I mean" BETWEEN two mentions —
    // anywhere else, "actually" is just a word.
    const correction = mentions.slice(1).some((m, i) => CORRECTION_RE.test(text.slice(mentions[i].end, m.index)));
    if (correction) {
      const m = mentions[mentions.length - 1];
      r.beds = m.beds;
      r.bedsSure = false;
      r.bedsHow = `they mention ${distinct.join(" and ")} bedrooms and seem to correct themselves — used the last one, ${m.beds}`;
    } else if (eachUnit || flatsNoHouse || (SEPARATE_RE.test(text) && !HOUSE_RE.test(text) && !allFloors)) {
      // "a 2 bed flat downstairs and a 3 bed flat upstairs" — two dwellings,
      // and each one needs its own certificate.
      r.units = mentions.map((m) => ({ beds: m.beds, qty: 1, where: m.floor || "" }));
      r.bedsHow = `read as ${mentions.length} separate ${mentions.length === 2 ? "flats" : "dwellings"} (${mentions.map((m) => `${m.beds}-bed${m.floor ? ` ${m.floor.toLowerCase()}` : ""}`).join(", ")})`;
    } else if (allFloors || mentions.some((m) => m.floor)) {
      // "2 bedrooms downstairs and 3 bedrooms upstairs" — floors of one
      // property, so the bedrooms add up.
      const sum = mentions.reduce((a, m) => a + m.beds, 0);
      r.beds = sum;
      r.bedsSure = false;
      r.bedsHow = `added up across floors: ${mentions.map((m) => `${m.beds}${m.floor ? ` ${m.floor.toLowerCase()}` : ""}`).join(" + ")} = ${sum}`;
      r.maybeSeparate = true;
    } else {
      const max = Math.max(...distinct);
      r.beds = max;
      r.bedsSure = false;
      r.bedsHow = `they mention ${distinct.join(" and ")} bedrooms — priced at the largest, ${max}`;
    }
  }
  if (r.beds == null && !r.units && (r.studio || r.bedsit)) {
    r.beds = 0;
    r.bedsHow = r.bedsit ? "bedsit — priced as a studio" : "studio";
  }
  // "6 room HMO", "5 lettable rooms" — for an HMO, the letting rooms are
  // the bedrooms.
  if (r.beds == null && !r.units && r.hmo) {
    const rooms = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:-\\s*)?(?:lettable\\s+|letting\\s+|let\\s+|bed\\s*)?rooms?\\b`, "i"), 20);
    if (rooms) {
      r.beds = rooms;
      r.bedsSure = false;
      r.bedsHow = `HMO with ${rooms} rooms — each letting room counted as a bedroom`;
    }
  }
  if (!r.units) r.unitCount = unitCount(text);

  // ── gas ──
  const gasRe = new RegExp(`\\b${NUM}\\s*(?:x\\s*)?gas\\s+appliances?\\b`, "i");
  r.gasExplicit = firstCount(text, gasRe, 20);
  r.anyAppliances = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:x\\s*)?appliances?\\b`, "i"), 200);
  r.gasNamed = namedGasAppliances(text);

  // ── everything else ──
  r.consumerUnits = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:x\\s*)?(?:consumer\\s+units?|fuse\\s*(?:boxes|box|boards?)|distribution\\s+boards?|db'?s\\b|cu'?s\\b|electric(?:al)?\\s+meters?)`, "i"), 20);
  r.patItems = firstCount(text, new RegExp(`\\b${NUM}\\s*\\+?\\s*(?:x\\s*)?(?:portable\\s+|electrical\\s+|electric\\s+)?(?:appliances?|items?|plugs?|devices?)\\b`, "i"), 500);
  r.emLights = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:x\\s*)?(?:emergency\\s+)?(?:lights?|lighting\\s+(?:units?|points?|fittings?)|light\\s+fittings?|luminaires?|bulkheads?|exit\\s+signs?)\\b`, "i"), 200);
  r.alarms = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:x\\s*)?(?:smoke\\s+and\\s+heat\\s+|smoke\\s*\\/\\s*heat\\s+|smoke\\s+|heat\\s+|fire\\s+|co\\s+)?(?:alarms?|detectors?)\\b`, "i"), 200);
  r.extinguishers = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:x\\s*)?(?:fire\\s+)?extinguishers?\\b`, "i"), 200);
  r.floors = firstCount(text, new RegExp(`\\b${NUM}\\s*(?:-\\s*)?(?:storey|story|floors?|levels?)\\b`, "i"), 60);
  const sqm = text.match(/\b(\d{2,5}(?:\.\d+)?)\s*(?:m2|m²|sq\.?\s*m(?:etres?|eters?)?\b|square\s+met(?:er|re)s?|sqm)/i);
  const sqft = text.match(/\b(\d{3,6})\s*(?:sq\.?\s*ft|square\s+f(?:ee|oo)t|sqft|ft2|ft²)/i);
  r.sqm = sqm ? Number(sqm[1]) : sqft ? Math.round(Number(sqft[1]) * 0.0929) : null;
  r.sqmFromFeet = !sqm && !!sqft;
  return r;
}

// ── Tiers ────────────────────────────────────────────────────────────────
const dash = (s) => String(s || "").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

// Find a tier by its label, forgiving the dash and spacing differences
// between the website's labels and ours ("1-3 Bedrooms" vs "1–3 Bedrooms").
export function findTier(service, label) {
  if (!service?.tiers || !label) return null;
  const want = dash(label);
  return service.tiers.find((t) => dash(t.label) === want) || null;
}

// Numbers out of a tier label as a [lo, hi] range: "Up to 10 appliances" →
// [0,10], "10–15 appliances" → [10,15], "4 Bedrooms" → [4,4], "more than 12
// floors" → [13,∞], "1 Gas Appliance" → [1,1].
function labelRange(label) {
  const l = dash(label);
  const nums = (l.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (/up to|under|less than/.test(l)) return [0, nums[0]];
  if (/more than|over|\+/.test(l)) return [nums[0] + (/\+/.test(l) ? 0 : 1), Infinity];
  return nums.length > 1 ? [nums[0], nums[1]] : [nums[0], nums[0]];
}

// The tier a count falls in, among the tiers whose label matches `only`.
// Returns { tier, over } — `over` when the count is above every tier.
export function tierForCount(service, n, only) {
  if (!service?.tiers?.length || n == null) return { tier: null, over: false };
  const tiers = service.tiers.filter((t) => !only || only.test(t.label));
  for (const t of tiers) {
    const r = labelRange(t.label);
    if (r && n >= r[0] && n <= r[1]) return { tier: t, over: false };
  }
  const numbered = tiers.filter((t) => labelRange(t.label));
  const top = numbered[numbered.length - 1] || null;
  const topHi = top ? labelRange(top.label)[1] : 0;
  return { tier: n > topHi ? top : null, over: n > topHi };
}

// Bedroom tiers only — FRA's "Communal areas · 1–3 floors" has numbers in
// it too, and used to be picked for a two-bed flat.
export function tierForBeds(service, beds) {
  if (!service?.tiers?.length || beds == null) return { tier: null, over: false };
  if (beds === 0) {
    const studio = service.tiers.find((t) => /studio/i.test(t.label));
    if (studio) return { tier: studio, over: false };
    return tierForCount(service, 1, /bed/i);
  }
  return tierForCount(service, beds, /bed/i);
}

// Which reading drives each size-priced service. `beds` services are the
// residential ones priced on bedrooms; the rest each have their own count.
export const SIZE_RULES = {
  EICR: { by: "beds" },
  EPC: { by: "beds" },
  FRA: { by: "beds" },
  EICR_COM: { by: "consumerUnits", only: /consumer/i, ask: "how many consumer units (fuse boards)" },
  EPC_COM: { by: "sqm", only: /m²/i, ask: "the floor area in m²" },
  PAT: { by: "patItems", only: /appliance/i, ask: "roughly how many appliances" },
  PAT_COM: { by: "patItems", only: /appliance/i, ask: "roughly how many appliances" },
  EMLIGHT: { by: "emLights", only: /light/i, ask: "how many emergency lights" },
  EMLIGHT_COM: { by: "emLights", only: /light/i, ask: "how many emergency lights" },
  FSC: { by: "alarms", only: /alarm/i, ask: "how many smoke/heat alarms" },
  FSC_COM: { by: "alarms", only: /alarm/i, ask: "how many alarms" },
  FIRE_EXT_TEST: { by: "extinguishers", only: /extinguisher/i, ask: "how many extinguishers" },
  GAS_COM: { by: "gas", only: /appliance/i, ask: "how many gas appliances" },
};

export const svc = (code) => SERVICE_CATALOG.find((s) => s.code === code) || null;
