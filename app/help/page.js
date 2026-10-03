"use client";

import { useState, useRef } from "react";
import {
  FiBookOpen,
  FiFileText,
  FiFolder,
  FiPlus,
  FiTrash2,
  FiSave,
  FiUpload,
  FiDownload,
  FiExternalLink,
  FiBriefcase,
  FiBarChart2,
  FiMail,
  FiUsers,
  FiClipboard,
  FiDollarSign,
  FiBell,
  FiPaperclip,
  FiActivity,
  FiShield,
} from "react-icons/fi";
import { FaHardHat } from "react-icons/fa";
import { useStore } from "@/lib/store";
import { DOC_CATEGORIES } from "@/lib/docs";
import { TEMPLATE_VARS } from "@/lib/settings";
import { fmtDate } from "@/lib/format";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";
import PageHeader from "@/components/PageHeader";
import InvoiceArchive from "@/components/InvoiceArchive";

const TABS = [
  { key: "new", label: "What's new", icon: FiBell },
  { key: "workflow", label: "Full workflow", icon: FiActivity },
  { key: "guide", label: "User guide", icon: FiBookOpen },
  { key: "templates", label: "Document templates", icon: FiFileText },
  { key: "company", label: "Company documents", icon: FiFolder },
  { key: "invoices", label: "Invoices", icon: FiFileText },
];

export default function HelpPage() {
  const [tab, setTab] = useState("workflow");

  return (
    <>
      <PageHeader
        icon={FiBookOpen}
        title="Help & Documents"
        subtitle="User guide, templates and company document storage"
        actions={
          <button
            className="btn-outline py-1.5 text-sm"
            onClick={() => {
              try { sessionStorage.setItem("lcl-start-tour", "1"); } catch {}
              window.location.href = "/";
            }}
          >
            🗺 Guided tour
          </button>
        }
      />

      <div className="p-4 sm:p-8">
        <div className="mb-6 scroll-area -mx-1 overflow-x-auto px-1 pb-1 sm:overflow-visible">
          <div className="flex w-max min-w-full gap-1 rounded-lg border border-navy-200 bg-white p-1 sm:w-auto sm:flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  tab === t.key
                    ? "bg-navy-800 text-white"
                    : "text-navy-500 hover:bg-navy-50"
                }`}
              >
                <Icon /> {t.label}
              </button>
            );
          })}
          </div>
        </div>

        {tab === "new" && <WhatsNew />}
        {tab === "workflow" && <WorkflowGuide />}
        {tab === "guide" && <UserGuide />}
        {tab === "templates" && <DocTemplates />}
        {tab === "company" && <CompanyDocs />}
        {tab === "invoices" && <InvoiceArchive />}
      </div>
    </>
  );
}

/* ---------- Full workflow (end-to-end process) ---------- */
function WorkflowGuide() {
  const steps = [
    {
      n: 1,
      title: "A lead comes in",
      body:
        "An enquiry arrives — a phone call, a WhatsApp, a website form, or an email. Whoever takes it gathers: what certificate they need, the property address, who the landlord/agent is, and who will give access (sometimes a tenant, not the owner).",
    },
    {
      n: 2,
      title: "Create the job (status: Quote)",
      body:
        "Click New job. Pick the client or 'Add new client'. Choose the service(s) — for sized services (EICR/EPC/FRA/alarms) pick the property size from the dropdown; for Gas, set the appliance count. Set 'Name on certificate', and an 'Access contact' if a tenant lets the engineer in. Pick the date and a time window (Morning 8am–1pm / Afternoon 1pm–6pm). The job saves as a Quote.",
    },
    {
      n: 3,
      title: "Send the quote",
      body:
        "Open the job → Quote to make a branded quote PDF, and/or Email → Quote template to email it. Prices are all-inclusive (the total is the total on documents). If you're giving a goodwill discount on parking/congestion, tick 'Waive' on that line — it still shows on the quote, marked discounted.",
    },
    {
      n: 4,
      title: "Client accepts → book it (status: Scheduled)",
      body:
        "When the client says yes, click 'Accept quote' (moves it to Scheduled). Send the Booking confirmation email so they have the date/time in writing.",
    },
    {
      n: 5,
      title: "Dispatch to an engineer",
      body:
        "On the day, the Dispatch board shows the job under the assigned engineer. Send the engineer the Offer job card (no client number/notes yet). When they confirm, click 'Mark confirmed' and send the Assigned card — now it includes the access contact's number and your call instruction.",
    },
    {
      n: 6,
      title: "Work is done → upload the certificate",
      body:
        "The engineer (who is the accredited/certified one) carries out the job and sends you the certificate. Upload that certificate and any photos to the job's Documents area so everything lives on the job forever.",
    },
    {
      n: 7,
      title: "Outcome — this is where it branches",
      body:
        "PASS → mark the job Completed. FAIL → it needs remedial work: raise a follow-up job for the remedial. ADVISORY (e.g. a boiler passes but gets a warning notice) → no immediate action, but you've flagged it — later you can offer a replacement/repair as a brand-new job/service.",
    },
    {
      n: 8,
      title: "Invoice & get paid",
      body:
        "On a completed job, click Invoice (PDF + Email → Invoice template) to bill the client. They pay by bank transfer (BACS details + the job reference are on the job). When the money lands, Mark as paid and upload their payment screenshot as proof.",
    },
    {
      n: 9,
      title: "Send the certificate to the client",
      body:
        "Email the client their certificate (attach the file you uploaded in step 6). The whole conversation — quote, booking, invoice, proof, certificate — stays on the job for anyone who opens it later.",
    },
    {
      n: 10,
      title: "Renewal — the loop closes",
      body:
        "When you complete a job, the certificate's expiry is worked out automatically. ~60 days before it expires, the Dashboard's renewals panel flags it. Send a Renewal reminder — and that becomes a new job. Back to step 2.",
    },
  ];

  return (
    <div className="measure space-y-6">
      <div className="card border-l-4 border-l-brand-500 p-5">
        <h3 className="text-base font-bold text-navy-900">
          How a job flows through LCL Ops
        </h3>
        <p className="mt-1 text-sm text-navy-500">
          The complete process from first enquiry to renewal. New to the team? Read
          this top to bottom — it shows how every section fits together.
        </p>
      </div>

      <ol className="relative space-y-4 border-l-2 border-navy-100 pl-6">
        {steps.map((s) => (
          <li key={s.n} className="relative">
            <span className="absolute -left-[34px] grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-xs font-bold text-white">
              {s.n}
            </span>
            <div className="card p-4">
              <h4 className="text-sm font-bold text-navy-900">{s.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-navy-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="card bg-navy-50 p-4 text-sm text-navy-600">
        <p className="font-semibold text-navy-800">Quick status cheat-sheet</p>
        <p className="mt-1">
          <strong>Quote</strong> → priced, not booked · <strong>Scheduled</strong> →
          client accepted, booked in · <strong>In progress</strong> → engineer on it ·
          <strong> Completed</strong> → work done · <strong>Invoiced</strong> → bill
          sent · <strong>Paid</strong> → money received · <strong>Cancelled</strong> →
          fell through.
        </p>
      </div>
    </div>
  );
}

/* ---------- What's new ---------- */
// Plain-English changes the team should know about, newest first. Add to the
// top when something changes how people work.
const CHANGES = [
  { when: "October 2026", items: [
    "Expenses are grouped (Staff, Cost of jobs, Running costs, Bank & money) and owner drawings are kept out of profit. Old expenses can be re-filed in one go.",
    "Staff & salaries in Reports → Expenses: record each person's pay every month.",
    "Tasks go to agents only; admins supervise and can take over. Undo after ticking done; 'Remove' for tasks that shouldn't exist.",
    "Your dashboard lists only what's due today or late.",
    "Changing a quote's services or total asks first. If the client already has it, you're offered 'Send corrected quote'.",
    "Never put a price in a WhatsApp message — the price is only in the emailed quote.",
    "New saved replies: corrected quote, gentle follow-up, visit tomorrow, no access, payment received, renewal due.",
    "Jobs → Needs doing → 'Not touched for 7+ days' finds forgotten jobs.",
    "The job's Communication panel says who spoke last and whether the client is waiting on us.",
  ] },
];

function WhatsNew() {
  return (
    <div className="space-y-4">
      {CHANGES.map((c) => (
        <div key={c.when} className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-navy-900">{c.when}</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-navy-700">
            {c.items.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ---------- User guide ---------- */
function UserGuide() {
  const sections = [
    {
      icon: FiBriefcase,
      title: "Creating jobs",
      steps: [
        "Click 'New job' from the Dashboard, Dispatch or Jobs.",
        "Pick an existing client, or tap 'Add new client' to create one on the spot — saved to Clients automatically.",
        "Tick the services. Size-priced services (EICR, EPC, FRA, alarms) show a tier dropdown — pick the property size/quantity and the price fills in. Gas is priced by appliance count (£60 / £70 / £80).",
        "Every line's price is editable, and you can add a custom one-off service. Add Parking (£5) or Congestion (£10) charges if needed.",
        "Set 'Name on certificate', and an 'Access contact' if a tenant (not the client) will let the engineer in.",
        "Pick the date, choose a Part of day (Morning/Afternoon/Evening auto-fills the time window), assign the engineer, then create.",
      ],
    },
    {
      icon: FiClipboard,
      title: "Job cards (sending work to engineers)",
      steps: [
        "Open a job (or use the card button on a Jobs row / Dispatch card) and click 'Job card'.",
        "Send the 'Offer card' first to ask an engineer to take it — the contact number and notes stay hidden.",
        "When they accept, hit 'Mark confirmed' — the 'Assigned card' adds the access number, call instruction and notes.",
        "If a job's services are split across two engineers, pick whose card to send (or one combined card). Copy, WhatsApp or Print it.",
      ],
    },
    {
      icon: FaHardHat,
      title: "Dispatch & engineers",
      steps: [
        "Dispatch is your daily hub — pick a day from the mini calendar; each engineer has a column.",
        "Drag a job card between engineers to reassign it. Days with jobs show a green dot.",
        "Manage your engineers on the Engineers page: their postcode/areas, services covered, pay and whether they're VAT registered.",
        "If an engineer is VAT registered, 20% VAT is added on top of their share (the customer invoice is never affected) — shown on each job's Financials and in Reports.",
        "Switch Dispatch to the Week view to see every engineer's whole week at a glance (engineers as rows, days as columns).",
        "On a job with several services you can assign a different engineer to each line.",
      ],
    },
    {
      icon: FiDollarSign,
      title: "Quotes, invoices & payment",
      steps: [
        "On a job, 'Quote' makes a branded quote PDF (valid 30 days). 'Invoice' makes the invoice with bank details and an auto-incrementing number.",
        "When a client accepts — online through their link, or by phone/WhatsApp — the quote card's 'Client accepted' records it. The job isn't booked until an engineer has confirmed the date.",
        "Changing the services or total of a quote always asks first and lists exactly what will change. If the client already has the quote, the app offers to send the corrected one.",
        "Mark a job invoiced/paid in the Payment panel. Upload a screenshot of the client's payment as proof.",
        "Bank transfer (BACS) details and the job reference are shown for the client to pay.",
        "Waiving a parking or congestion charge keeps the original amount visible on the invoice, struck through and marked 'Discounted', but it adds £0 to the total.",
        "Parking reconciliation: each job records what parking you charged the customer and the engineer's receipt. The engineer is reimbursed the receipt amount; the difference is shown as retained or absorbed.",
      ],
    },
    {
      icon: FiPaperclip,
      title: "Documents & certificates",
      steps: [
        "Each job has a 'Documents & photos' area — upload the finished certificates (CP12, EICR PDFs) and site photos.",
        "View, download or remove any file. They stay attached to the job.",
        "Editable document templates and company-document storage live here in Help & Docs.",
      ],
    },
    {
      icon: FiBell,
      title: "Renewal reminders",
      steps: [
        "When you mark a job completed/paid, its certificate expiry is worked out automatically — or auto-read from an uploaded certificate PDF.",
        "Certificates coming up for renewal are picked up by the renewal outreach (Prospects) and the saved WhatsApp reply 'Certificate renewal due'.",
        "Recurring jobs: on a completed job you can auto-create next year's job at cert expiry, so annual renewals never slip.",
        "Unpaid invoices show as a next step on the job ('Chase payment') and in the weekly email of who owes what.",
      ],
    },
    {
      icon: FiBarChart2,
      title: "Reports & P&L",
      steps: [
        "Choose Day / Week / Month / Year and step through time. The headline cards show Revenue, Collected, Net Profit (after engineer costs) and Avg job value.",
        "The P&L breakdown shows: Gross Revenue → minus Engineer Costs → Net after engineers → minus Company Expenses → True Net Profit with margin %.",
        "Company expenses are on the Expenses tab — see 'Expenses, salaries & owner drawings' below.",
        "The Engineer pay table shows each engineer's revenue share, labour cut, VAT (if registered) and parking reimbursements — with a totals row.",
        "Switch to the Pipeline tab for quote→booked→paid conversion rates and your top services.",
      ],
    },
    {
      icon: FiMail,
      title: "Email, WhatsApp & communication",
      steps: [
        "Set sender details and edit the 9 email templates in Settings → Email configuration. Sign-off appends automatically — never duplicated.",
        "On any job, 'Send email' composes from a template pre-filled with that job's data. Client replies land in the job thread with a chime + bell notification — no refresh needed.",
        "When a status changes with auto-notifications on, a confirmation dialog appears before sending — no accidental emails to clients.",
        "Each job has a 'Share' button — copies a public no-login status link you can text or WhatsApp directly to the client.",
        "Open a client to see their full Portfolio with cert status per property, job history and lifetime value.",
      ],
    },
    {
      icon: FiShield,
      title: "Logins, access & security",
      steps: [
        "Sign in with your username (e.g. 'mark') or email — both work. Google Sign-In is also available on the login screen.",
        "Admins see everything. Agents are office staff — they see what their permissions allow (set per person in Settings → Users & access). Engineers sign in to their own portal: only their jobs, the map and their pay.",
        "New logins from an unknown device or IP automatically trigger a security alert email to your account.",
        "Admins manage users in Settings → Users & access: add name, username, email, role and password. Upload a profile photo from the Edit button.",
        "Give an engineer the same email on their login and their Engineer record to restrict them to their own jobs only.",
      ],
    },
    {
      icon: FiUsers,
      title: "Engineers section",
      steps: [
        "The Engineers section (sidebar) shows your full roster with type, trade, contact, % cut, VAT status, jobs completed and revenue.",
        "Add or edit engineers here. Set their pay and tick VAT registered if they charge VAT on their share (internal only — never shown to clients).",
        "Revenue and job counts update automatically from completed/invoiced/paid jobs assigned to each engineer.",
        "To scope an engineer to their own jobs only: use the same email address for their login account and their Engineer record.",
      ],
    },
    {
      icon: FiUsers,
      title: "Tasks & team",
      steps: [
        "The app raises a task whenever a job needs something (reply, quote, book, chase payment…) and closes it by itself when the job moves on.",
        "Automatic tasks go to agents only. Admins supervise: they see everyone's list on Team → People and get a push when a task is left too long.",
        "If an agent doesn't pick a task up in time it moves to another agent once; after that it is flagged 'Left too long' and an admin can 'Take over' (the agent is told).",
        "Ticking a task done only closes the task — it never changes the job. 'Undo' appears for 8 seconds; 'Reopen' is in the task.",
        "'Remove' is for a task that shouldn't exist. An automatic one stays away unless the job changes.",
        "Dashboards list only what is due today or late. Reminder options: one notification; daily until done; or aggressive — straight away, then about 9am, 3pm and 7pm each day.",
        "Admins can give a task to anyone; agents add tasks to their own list. Search for the job by client name, postcode or address.",
      ],
    },
    {
      icon: FiDollarSign,
      title: "Expenses, salaries & owner drawings",
      steps: [
        "Reports → Expenses. Every expense is filed in a group: Staff, Cost of jobs, Running costs, Bank & money, Other — the category is suggested from the name as you type.",
        "Owner drawings (personal money taken out) are listed but NOT counted as a business cost or taken off profit.",
        "Staff & salaries: add each office person on salary with their monthly or weekly pay, then 'Record salary' each month — it becomes a Staff salaries expense and the month shows who is still to be paid.",
        "A monthly expense counts from the month of its date until the month it was stopped ('Stopped after'). Old entries under the previous category names can be re-filed in one go.",
        "CSV downloads the period's expenses for the accountant. Engineers are paid per job in Engineer pay, not here.",
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className="card p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <h3 className="text-sm font-bold text-navy-900">{s.title}</h3>
            </div>
            <ol className="space-y-2">
              {s.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-navy-600">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-100 text-[11px] font-bold text-navy-600">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Document templates ---------- */
function DocTemplates() {
  const { docTemplates, addDocTemplate, updateDocTemplate, removeDocTemplate } =
    useStore();
  const [activeId, setActiveId] = useState(docTemplates[0]?.id || null);
  const active = docTemplates.find((d) => d.id === activeId) || docTemplates[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
      {/* List */}
      <div className="card h-fit">
        <div className="flex items-center justify-between border-b border-navy-100 p-3">
          <span className="section-label text-xs">
            Templates
          </span>
          <button
            onClick={() => {
              const d = addDocTemplate({});
              setActiveId(d.id);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <FiPlus /> New
          </button>
        </div>
        <ul className="divide-y divide-navy-100">
          {docTemplates.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setActiveId(d.id)}
                className={`w-full px-4 py-3 text-left transition hover:bg-navy-50 ${
                  active?.id === d.id ? "bg-brand-50" : ""
                }`}
              >
                <p className="text-sm font-semibold text-navy-900">{d.name}</p>
                <p className="text-xs text-navy-500">{d.category}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Editor */}
      {active ? (
        <div className="card p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Document name</label>
              <input
                className="input"
                value={active.name}
                onChange={(e) =>
                  updateDocTemplate(active.id, { name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={active.category}
                onChange={(e) =>
                  updateDocTemplate(active.id, { category: e.target.value })
                }
              >
                {["Sales", "Operations", "Legal", "Other"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="label">Document body</label>
            <textarea
              className="input resize-none font-mono text-xs leading-relaxed"
              rows={16}
              value={active.body}
              onChange={(e) =>
                updateDocTemplate(active.id, { body: e.target.value })
              }
            />
          </div>

          <div className="mt-3">
            <p className="label">Insert variables</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v.token}
                  title={v.desc}
                  onClick={() =>
                    updateDocTemplate(active.id, {
                      body: active.body + " " + v.token,
                    })
                  }
                  className="rounded-md bg-navy-50 px-2 py-1 font-mono text-[11px] text-navy-600 hover:bg-navy-100"
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-600">
              <FiSave /> Saved automatically
            </span>
            <button
              onClick={() => {
                removeDocTemplate(active.id);
                setActiveId(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
            >
              <FiTrash2 /> Delete template
            </button>
          </div>
        </div>
      ) : (
        <div className="card grid place-items-center p-10 text-sm text-navy-400">
          Select or create a template.
        </div>
      )}
    </div>
  );
}

/* ---------- Company documents (real upload) ---------- */
function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function CompanyDocs() {
  const { companyDocs, addCompanyDoc, updateCompanyDoc, removeCompanyDoc } = useStore();
  const [category, setCategory] = useState(DOC_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const MAX = 9 * 1024 * 1024; // 9MB cap (Supabase Storage)

  const handleFiles = async (fileList) => {
    setError("");
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      if (file.size > MAX) {
        setError(`"${file.name}" is over 9MB.`);
        continue;
      }
      const up = await uploadFile(file, "company");
      addCompanyDoc({
        ...up,
        category,
        note: note.trim(),
        mime: file.type || "application/octet-stream",
      });
    }
    setBusy(false);
    setNote("");
  };

  const removeDoc = (d) => {
    if (d.path) removeFile(d.path);
    removeCompanyDoc(d.id);
  };

  const OFFICE_EXT = /\.(docx?|xlsx?|pptx?)$/i;

  // "Open" — view the file. Word/Excel/PowerPoint don't render in mobile
  // browser tabs (Android shows a blank tab, iOS may not preview at all), so
  // route those through Google's viewer; everything else (PDFs, images) opens
  // directly.
  const openDoc = (d) => {
    const src = fileSrc(d);
    if (!src) return;
    if (src.startsWith("http") && OFFICE_EXT.test(d.name || src)) {
      window.open(`https://docs.google.com/view?url=${encodeURIComponent(src)}`, "_blank");
      return;
    }
    window.open(src, "_blank");
  };

  // "Download" — save a copy locally. Cross-origin URLs ignore the `download`
  // attribute, so fetch the file as a blob and save that instead.
  const downloadDoc = async (d) => {
    const src = fileSrc(d);
    if (!src) return;
    let href = src;
    let revoke = false;
    if (src.startsWith("http")) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        href = URL.createObjectURL(blob);
        revoke = true;
      } catch {
        // fall back to direct link if fetch fails (e.g. CORS)
      }
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = d.name || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) URL.revokeObjectURL(href);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
      {/* Upload form */}
      <div className="card h-fit p-5">
        <h3 className="mb-3 text-sm font-bold text-navy-900">Upload a document</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              placeholder="Reference, expiry…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
              dragOver
                ? "border-brand-400 bg-brand-50"
                : "border-navy-200 bg-navy-50/50 hover:border-brand-300"
            }`}
          >
            <FiUpload className="h-6 w-6 text-brand-500" />
            <p className="text-sm font-semibold text-navy-700">
              {busy ? "Uploading…" : "Click or drop files here"}
            </p>
            <p className="text-[11px] text-navy-400">PDF, images, docs · up to 9MB</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = ""; // allow re-uploading same file
              }}
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-500">
            Files are stored in shared cloud storage — visible to everyone signed
            in, on any device.
          </p>
        </div>
      </div>

      {/* List */}
      <div>
        {companyDocs.length === 0 ? (
          <div className="card grid place-items-center p-10 text-center text-sm text-navy-400">
            No documents yet. Upload insurance, accreditations and certificates to
            keep them in one place.
          </div>
        ) : (
          <div className="card divide-y divide-navy-100">
            {companyDocs.map((d) => (
              <div
                key={d.id}
                className="flex min-w-0 items-center justify-between gap-3 p-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-500">
                    <FiFileText className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">
                      {d.name}
                    </p>
                    <p className="text-xs text-navy-500">
                      {/* A plain badge before this couldn't be changed once
                          uploaded — the only way to fix a wrong category was
                          delete and re-upload. This is the same badge, just
                          styled as a select so re-categorizing is a click. */}
                      <select
                        className="cursor-pointer rounded-full border-0 bg-navy-100 px-2 py-0.5 font-semibold text-navy-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        value={d.category}
                        onChange={(e) => updateCompanyDoc(d.id, { category: e.target.value })}
                        aria-label="Category"
                      >
                        {DOC_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {d.size ? (
                        <span className="ml-2">{formatBytes(d.size)}</span>
                      ) : null}
                      <span className="ml-2">Added {fmtDate(d.addedAt)}</span>
                    </p>
                    {d.note && (
                      <p className="mt-1 text-xs text-navy-500">{d.note}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {fileSrc(d) && (
                    <button
                      onClick={() => openDoc(d)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-navy-100"
                      aria-label="Open document"
                      title="Open"
                    >
                      <FiExternalLink />
                    </button>
                  )}
                  {fileSrc(d) && (
                    <button
                      onClick={() => downloadDoc(d)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-navy-100"
                      aria-label="Download document"
                      title="Download"
                    >
                      <FiDownload />
                    </button>
                  )}
                  <button
                    onClick={() => removeDoc(d)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"
                    aria-label="Remove document"
                    title="Remove"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
