#!/usr/bin/env python3
"""
Process a raw LCL jobs CSV (one year, continuous list) into:
  - one enriched master CSV (all rows, extra parsed columns)
  - 12 monthly section CSVs (Jan..Dec leads)
  - a summary printout proving no rows are lost.

Usage:
  python3 process_prospects.py <input.csv> <year> [output_dir]

The raw columns expected:
  Job Date, Owner Name, Owner Phone, Tenant Name, Tenant Phone,
  Contact Email, Address, Job Status, Job Description,
  Cert Renewal Date, Invoice Amount
"""
import csv, re, sys, os
from collections import Counter

MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Service detection. Each row can match several. Codes match the FSM catalogue.
SERVICE_PATTERNS = [
    ("GAS",     r"\b(gas safety|gsc|cgsc|cp12|lgsr|gas cert|boiler service|appliance)\b"),
    ("EICR",    r"\beicr\b|electric diagnostics|electrical install"),
    ("EPC",     r"\bepc\b"),
    ("PAT",     r"\bpat\b"),
    ("FRA",     r"\b(fra|fire risk assessment)\b"),
    ("FSC",     r"\b(fsc|fire safety cert|bs ?5839)\b"),
    ("ALARM",   r"\b(smoke|heat)\b.*\b(detector|alarm)|alarm system|interlink"),
    ("EMLIGHT", r"emergency light|\beml\b"),
    ("REMEDIAL",r"remedial|consumer unit|board change|rewire|installation of"),
]

# Renewal cadence in months, per service, for the renewal engine.
RENEWAL_MONTHS = {
    "GAS": 12, "PAT": 12, "FRA": 12, "FSC": 12, "ALARM": 12,
    "EMLIGHT": 12, "EICR": 60, "EPC": 120, "REMEDIAL": 60,
}

STATUS_BUCKET = {
    "Completed": "won",
    "Work Order": "open",
    "Quote": "open",
    "Unsuccessful": "lost",
}


def parse_date(d):
    d = (d or "").strip()
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", d)
    if not m:
        return None, None, None
    day, mo, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return day, mo, yr


def detect_services(desc):
    d = (desc or "").lower()
    found = [code for code, pat in SERVICE_PATTERNS if re.search(pat, d)]
    return found


def name_on_cert(desc):
    m = re.search(r"name on certs?:\s*([^\n]+?)(?:\s+(?:free parking|call|phone|tenant|$))",
                  (desc or ""), re.I)
    return m.group(1).strip() if m else ""


def size_tier(desc):
    m = re.search(r"(\d+\s*-\s*\d+)\s*bedroom", (desc or "").lower())
    if m:
        return m.group(1).replace(" ", "") + " bed"
    m = re.search(r"(\d+)\s*appliance", (desc or "").lower())
    if m:
        return m.group(1) + " appliance"
    return ""


def norm_phone(p):
    p = (p or "").strip()
    digits = re.sub(r"[^\d+]", "", p)
    return digits


def parse_money(v):
    v = (v or "").strip().replace("£", "").replace(",", "")
    try:
        return float(v) if v else ""
    except ValueError:
        return ""


def process(infile, year, outdir):
    rows = list(csv.DictReader(open(infile, encoding="utf-8-sig")))
    os.makedirs(outdir, exist_ok=True)

    out_fields = [
        "Month", "MonthNum", "JobDate", "OwnerName", "NameOnCert",
        "OwnerPhone", "TenantPhone", "ContactEmail", "Address",
        "Services", "PrimaryService", "SizeTier", "RenewalCadenceMo",
        "JobStatus", "StatusBucket", "JobDescription",
        "CertRenewalDate", "InvoiceAmount",
    ]

    enriched = []
    by_month = {m: [] for m in range(1, 13)}
    svc_counter = Counter()
    status_counter = Counter()
    no_service = 0

    for r in rows:
        _, mo, yr = parse_date(r.get("Job Date"))
        services = detect_services(r.get("Job Description"))
        if not services:
            no_service += 1
        primary = services[0] if services else "CONFIRM"
        cadence = min((RENEWAL_MONTHS[s] for s in services), default=12)
        status = (r.get("Job Status") or "").strip()
        out = {
            "Month": MONTHS[mo] if mo else "Unknown",
            "MonthNum": mo or "",
            "JobDate": (r.get("Job Date") or "").strip(),
            "OwnerName": (r.get("Owner Name") or "").strip(),
            "NameOnCert": name_on_cert(r.get("Job Description")),
            "OwnerPhone": norm_phone(r.get("Owner Phone")),
            "TenantPhone": norm_phone(r.get("Tenant Phone")),
            "ContactEmail": (r.get("Contact Email") or "").strip(),
            "Address": (r.get("Address") or "").strip(),
            "Services": "|".join(services),
            "PrimaryService": primary,
            "SizeTier": size_tier(r.get("Job Description")),
            "RenewalCadenceMo": cadence,
            "JobStatus": status,
            "StatusBucket": STATUS_BUCKET.get(status, "open"),
            "JobDescription": (r.get("Job Description") or "").strip(),
            "CertRenewalDate": (r.get("Cert Renewal Date") or "").strip(),
            "InvoiceAmount": parse_money(r.get("Invoice Amount")),
        }
        enriched.append(out)
        if mo:
            by_month[mo].append(out)
        for s in services:
            svc_counter[s] += 1
        status_counter[status] += 1

    # write master
    master = os.path.join(outdir, f"prospects_{year}_master.csv")
    with open(master, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields)
        w.writeheader()
        w.writerows(enriched)

    # write monthly sections
    for mo in range(1, 13):
        fn = os.path.join(outdir, f"{mo:02d}_{MONTHS[mo]}_leads_{year}.csv")
        with open(fn, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=out_fields)
            w.writeheader()
            w.writerows(by_month[mo])

    # summary
    print(f"\n=== {year} PROSPECTS PROCESSED ===")
    print(f"Input rows:   {len(rows)}")
    print(f"Output rows:  {len(enriched)}  (master)")
    print(f"Sum monthly:  {sum(len(v) for v in by_month.values())}")
    assert len(rows) == len(enriched), "ROW LOSS!"
    print("\nPer-month lead counts:")
    for mo in range(1, 13):
        print(f"  {MONTHS[mo]:4s} {len(by_month[mo]):4d}")
    print("\nService spread:", dict(svc_counter.most_common()))
    print("Status spread:", dict(status_counter.most_common()))
    print(f"Rows needing service confirmation on call: {no_service}")
    print(f"\nWritten to: {outdir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    infile = sys.argv[1]
    year = sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else f"data/prospects/{year}"
    process(infile, year, outdir)
