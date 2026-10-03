// What the company spends, filed so the totals mean something.
//
// The old list (Staffing / Technology / Operations / Legal / Other…) filed
// SIM top-ups under both Technology and Marketing, certificate fees under
// Legal, managerial pay under Operations, and personal money under Other —
// so "expenses" mixed the cost of doing jobs, the cost of running the
// office, staff pay and money the owner took out. Each now has its own
// group, and owner drawings are kept OUT of business profit entirely.
//
// "Bank Transfer Fees" keeps its exact spelling: the engineer-payment code
// writes it automatically (lib/store.js addEngineerPayment).

export const EXPENSE_GROUPS = [
  { key: "staff", label: "Staff", cats: ["Staff salaries", "Staff bonuses & commission"] },
  { key: "jobs", label: "Cost of jobs", cats: ["Certificate & scheme fees", "Subcontractor & call-out", "Parts & materials"] },
  { key: "running", label: "Running costs", cats: ["Phone & SIM", "Software & subscriptions", "Marketing & design", "Travel & vehicles", "Insurance", "Accounts & legal", "Office & admin"] },
  { key: "money", label: "Bank & money", cats: ["Bank Transfer Fees", "Currency & payment fees"] },
  { key: "other", label: "Other", cats: ["Other"] },
  { key: "drawings", label: "Owner drawings (not a business cost)", cats: ["Owner drawings"] },
];

export const EXPENSE_CATEGORIES = EXPENSE_GROUPS.flatMap((g) => g.cats);
export const DRAWINGS = "Owner drawings";

// The old names, read as the closest new one until someone re-files them.
const LEGACY = {
  Staffing: "Staff salaries",
  Technology: "Software & subscriptions",
  Marketing: "Marketing & design",
  Operations: "Office & admin",
  Legal: "Accounts & legal",
  Vehicles: "Travel & vehicles",
  Insurance: "Insurance",
  Other: "Other",
};

export const isLegacyCategory = (c) => !EXPENSE_CATEGORIES.includes(c);
export const categoryOf = (e) => (EXPENSE_CATEGORIES.includes(e?.category) ? e.category : LEGACY[e?.category] || "Other");
export const groupOf = (cat) => EXPENSE_GROUPS.find((g) => g.cats.includes(cat)) || EXPENSE_GROUPS[4];
export const isDrawing = (e) => categoryOf(e) === DRAWINGS;

// A first guess from the name, so typing "UK SIM balance" files itself.
// Only a suggestion — the person logging it can always change it.
const RULES = [
  [/\b(salary|salaries|wage|wages|payroll|manag[ae]rial|manager pay|staff pay)\b/i, "Staff salaries"],
  [/\b(bonus|commission)\b/i, "Staff bonuses & commission"],
  [/\b(certificate|cert|scheme|niceic|napit|gas ?safe|lodg(e|ement))\b/i, "Certificate & scheme fees"],
  [/\b(call ?-?out|subcontract|sent to)\b/i, "Subcontractor & call-out"],
  [/\b(parts?|materials?|smoke alarm|detector|bulb|fitting)\b/i, "Parts & materials"],
  [/\b(sim|numero|phone|mobile|airtime|top ?-?up|uk number)\b/i, "Phone & SIM"],
  [/\b(claude|chatgpt|openai|subscription|software|vercel|supabase|domain|hosting|google workspace|hostinger|app)\b/i, "Software & subscriptions"],
  [/\b(graphics?|design|ads?|advert|marketing|facebook|meta|leaflet|flyer|seo)\b/i, "Marketing & design"],
  [/\b(travel|uber|train|tfl|fuel|petrol|parking|congestion|car|van|vehicle)\b/i, "Travel & vehicles"],
  [/\binsurance\b/i, "Insurance"],
  [/\b(accountant|accounts|legal|solicitor|companies house|ch paid|tax return)\b/i, "Accounts & legal"],
  [/\b(gbp ?to|pkr|exchange|wise|remit|transaction fees?|transfer fees?)\b/i, "Currency & payment fees"],
  [/\b(personal|per$|z-?per|family|fam|drawing|own use)\b/i, DRAWINGS],
];
export function suggestCategory(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return null;
}

// "YYYY-MM" of a date string.
const ym = (d) => String(d || "").slice(0, 7);

// Is a recurring expense running in a given month? It starts the month of
// its date and runs until `recurringUntil` (YYYY-MM, inclusive) if stopped.
export function recurringActiveIn(e, monthKey) {
  if (!e?.recurring) return false;
  const from = ym(e.date) || "0000-00";
  const until = e.recurringUntil ? ym(e.recurringUntil) : "9999-99";
  return monthKey >= from && monthKey <= until;
}

// Totals by group and category for a list of (already period-filtered)
// expense lines, each { e, amount }.
export function summarise(lines) {
  const byCat = new Map();
  for (const { e, amount } of lines) {
    const c = categoryOf(e);
    byCat.set(c, (byCat.get(c) || 0) + amount);
  }
  return EXPENSE_GROUPS.map((g) => {
    const cats = g.cats.map((c) => ({ cat: c, total: Math.round((byCat.get(c) || 0) * 100) / 100 })).filter((x) => x.total > 0);
    return { ...g, cats, total: Math.round(cats.reduce((s, x) => s + x.total, 0) * 100) / 100 };
  }).filter((g) => g.total > 0);
}

// Spreadsheet of expenses for the accountant.
export function expensesCsv(lines) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "Description", "Group", "Category", "Amount (£)", "Recurring", "Staff member", "Notes"];
  const rows = lines.map(({ e, amount, month }) => [
    month ? `${month}-01` : e.date, e.name, groupOf(categoryOf(e)).label, categoryOf(e), amount.toFixed(2), e.recurring ? "Monthly" : "", e.staffName || "", e.notes || "",
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
