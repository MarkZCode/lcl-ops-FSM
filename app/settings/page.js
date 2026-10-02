"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  FiRefreshCw,
  FiUsers,
  FiCreditCard,
  FiMail,
  FiMessageSquare,
  FiFileText,
  FiBook,
  FiCheckCircle,
  FiChevronRight,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiPhone,
  FiSettings,
  FiBell,
  FiBellOff,
  FiAlertTriangle,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { serviceShort } from "@/lib/format";
import { AUTO_NOTIFY_LABELS } from "@/lib/settings";
import BankAccounts from "@/components/BankAccounts";
import { PUSH_KINDS } from "@/lib/pushKinds";
import { useAuth } from "@/lib/auth";
import {
  pushSupported, isIosNonStandalone, getPushSubscription, enablePush, disablePush,
} from "@/lib/push";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import RequirePermission from "@/components/RequirePermission";
import UserManagement from "@/components/UserManagement";
import EngineerModal from "@/components/EngineerModal";
import { useConfirm } from "@/components/ConfirmProvider";
import HookSidebar from "@/components/HookSidebar";

const SETTINGS_NAV = [
  { id: "config", label: "Configuration" },
  { id: "profile", label: "Users & access" },
  { id: "engineers", label: "Engineers" },
  { id: "services", label: "Service catalogue & pricing" },
  { id: "push", label: "Urgent outreach alerts" },
  { id: "auto-notify", label: "Auto-notifications" },
  { id: "gmail", label: "Gmail push notifications" },
  { id: "integrations", label: "Integrations roadmap" },
  { id: "data", label: "Data" },
];

const integrations = [
  // ---- Live now ----
  {
    icon: FiMail,
    name: "Email (Resend + Gmail)",
    desc: "Quotes, invoices, reminders and chasers send automatically; client replies land back in the job thread in real time.",
    phase: "Live",
  },
  {
    icon: FiFileText,
    name: "Invoice & quote PDFs",
    desc: "Branded invoice/quote PDFs generate per job and attach to emails. Certificate expiry auto-reads from uploaded PDFs.",
    phase: "Live",
  },
  {
    icon: FiUsers,
    name: "User logins & roles",
    desc: "Per-person logins (username or email) with admin/engineer roles. Engineers see only their own jobs.",
    phase: "Live",
  },
  // ---- Phase 2 (next) ----
  {
    icon: FiCreditCard,
    name: "Stripe payments",
    desc: "Card payment links on invoices, auto-marking jobs paid. Needs your Stripe keys.",
    phase: "Phase 2",
  },
  {
    icon: FiMessageSquare,
    name: "WhatsApp auto-send",
    desc: "Proven working on a test number. Final step: register the LCL business number for templated confirmations & reminders.",
    phase: "Phase 2",
  },
  {
    icon: FiUsers,
    name: "Engineer mobile app",
    desc: "On-site app for engineers to view their day, upload certs and submit parking receipts from their phone.",
    phase: "Phase 2",
  },
  // ---- Phase 3 (later) ----
  {
    icon: FiBook,
    name: "Accounting sync (Xero / QuickBooks)",
    desc: "Push invoices, payments, engineer labour, VAT and parking into your accounts automatically.",
    phase: "Phase 3",
  },
  {
    icon: FiFileText,
    name: "Official certificate templates",
    desc: "Generate the actual CP12 / EICR / EPC certificate documents, not just invoices.",
    phase: "Phase 3",
  },
];

// One Settings section. On a phone it collapses to a tappable row so the page
// opens as an index rather than a 9-section scroll; from lg up it is just the
// section, always open, labelled by its own heading. See .set-head in globals.
function SettingsGroup({ title, children, id, openOnLoad = false }) {
  const [open, setOpen] = useState(openOnLoad);
  // Arriving from a deep link (the sidebar avatar sends you to
  // /settings?section=profile) must OPEN the section, not just scroll to a
  // collapsed row with nothing under it.
  useEffect(() => { if (openOnLoad) setOpen(true); }, [openOnLoad]);
  return (
    <section id={id} className={id ? "scroll-mt-24" : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-open={open}
        aria-expanded={open}
        className="set-head lg:hidden"
      >
        <span className="set-head-title">{title}</span>
        <FiChevronRight className="set-head-chev h-4 w-4" />
      </button>
      <div data-open={open} className={`set-body ${open ? "" : "hidden"} lg:block`}>
        {children}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission perm="settings">
      <SettingsInner />
    </RequirePermission>
  );
}

function AutoNotifySection() {
  const { autoNotify, updateAutoNotify } = useStore();
  return (
    <section>
      <h2 className="mb-3 section-label text-sm">
        Auto-notifications
      </h2>
      <div className="card divide-y divide-navy-100">
        {Object.entries(AUTO_NOTIFY_LABELS).map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-navy-900">{label}</p>
              <p className="text-xs text-navy-400">
                {autoNotify?.[key] ? "Auto-sends email to client" : "Off — send manually"}
              </p>
            </div>
            <input
              type="checkbox"
              checked={!!autoNotify?.[key]}
              onChange={(e) => updateAutoNotify(key, e.target.checked)}
              className="h-4 w-4 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-navy-400">
        When enabled, the matching email template is sent automatically when you change a job&apos;s status.
      </p>
    </section>
  );
}

function PushNotificationsSection() {
  const [state, setState] = useState("checking"); // checking | unsupported | ios-hint | off | on | working | error
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!pushSupported()) { setState(isIosNonStandalone() ? "ios-hint" : "unsupported"); return; }
    getPushSubscription().then((sub) => setState(sub ? "on" : "off")).catch(() => setState("off"));
  }, []);

  // Per-device result of a test push — what the push service said for each.
  const [test, setTest] = useState(null); // null | "sending" | { devices, note, error }
  const sendTest = async () => {
    setTest("sending");
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` },
      });
      const out = await res.json().catch(() => ({}));
      setTest(res.ok ? out : { error: out.error || `Failed (${res.status})` });
    } catch (e) {
      setTest({ error: e.message || "Couldn't reach the server." });
    }
  };

  // Which kinds of office push this person wants — saved on their account.
  const { user, updateOwnProfile } = useAuth();
  const [pushOff, setPushOff] = useState(user?.pushOff || []);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [awayUntil, setAwayUntil] = useState(user?.awayUntil || "");
  const isAway = !!awayUntil && awayUntil >= todayStr;
  const saveAway = async (until) => {
    const before = awayUntil;
    setAwayUntil(until);
    const r = await updateOwnProfile({ away_until: until });
    if (!r.ok) { setAwayUntil(before); setMsg(r.error || "Couldn't save that."); }
  };
  const togglePushKind = async (key) => {
    const next = pushOff.includes(key) ? pushOff.filter((k) => k !== key) : [...pushOff, key];
    setPushOff(next);
    const r = await updateOwnProfile({ push_off: next });
    if (!r.ok) { setPushOff(pushOff); setMsg(r.error || "Couldn't save that."); }
  };

  // Everything the business runs on, in one JSON file on this computer.
  const { jobs: allJobs, clients: allClients, engineers: allEngineers } = useStore();
  const downloadBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), jobs: allJobs, clients: allClients, engineers: allEngineers }, null, 1)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lcl-ops-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    try { localStorage.setItem("lcl-last-backup", stamp); } catch {}
  };

  const toggle = async () => {
    setState("working");
    setMsg("");
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
      } else {
        await enablePush();
        setState("on");
      }
    } catch (e) {
      setState(state === "on" ? "on" : "off");
      setMsg(e.message || "Something went wrong.");
    }
  };

  return (
    <section>
      <h2 className="mb-3 section-label text-sm">
        Urgent outreach alerts
      </h2>
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-900">
              Push notifications to this device
            </p>
            <p className="measure mt-1 text-xs leading-relaxed text-navy-500">
              Once a day (~8am) LCL Ops checks for renewals overdue or due
              within 14 days that haven&apos;t been chased recently, plus any
              new client replies — and sends one reminder to every device
              you&apos;ve enabled this on, phone or laptop.
            </p>
            {state === "ios-hint" && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-700">
                <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                On iPhone, Safari only allows notifications for apps added to
                the Home Screen. Tap Share → &ldquo;Add to Home Screen&rdquo;,
                then open LCL Ops from there and enable this again.
              </p>
            )}
            {state === "unsupported" && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                This browser doesn&apos;t support push notifications.
              </p>
            )}
            {msg && <p className="mt-2 text-xs font-semibold text-rose-600">{msg}</p>}
          </div>
          <button
            onClick={toggle}
            disabled={state === "working" || state === "checking" || state === "unsupported" || state === "ios-hint"}
            className="btn-outline shrink-0 disabled:opacity-50"
          >
            {state === "on" ? <FiBell className="text-brand-600" /> : <FiBellOff />}
            {state === "working" ? "Working…" : state === "on" ? "Enabled — turn off" : "Enable"}
          </button>
        </div>
        <div className="mt-4 border-t border-navy-100 pt-4">
          <p className="text-sm font-semibold text-navy-900">What reaches your devices</p>
          <p className="mt-1 text-xs text-navy-500">Your own choice — it doesn&apos;t change what anyone else gets. Between 9pm and 7am everything except a new enquiry waits until morning.</p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {PUSH_KINDS.map((k) => (
              <li key={k.key}>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-navy-700">
                  <input type="checkbox" checked={!pushOff.includes(k.key)} onChange={() => togglePushKind(k.key)} />
                  {k.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 border-t border-navy-100 pt-4">
          <p className="text-sm font-semibold text-navy-900">Away</p>
          <p className="mt-1 text-xs text-navy-500">While you&apos;re away no new tasks are given to you — they go to whoever is in. Tasks you already hold move on by themselves if they aren&apos;t picked up.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {isAway ? (
              <>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">Away until {new Date(`${awayUntil}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                <button className="btn-outline py-1.5 text-xs" onClick={() => saveAway("")}>I&apos;m back</button>
              </>
            ) : (
              <>
                <button className="btn-outline py-1.5 text-xs" onClick={() => saveAway(todayStr)}>Away today</button>
                <span className="text-navy-500">or until</span>
                <input type="date" className="input h-8 w-auto py-0 text-xs" min={todayStr} onChange={(e) => e.target.value && saveAway(e.target.value)} aria-label="Away until" />
              </>
            )}
          </div>
        </div>
        <div className="mt-4 border-t border-navy-100 pt-4">
          <p className="text-sm font-semibold text-navy-900">Backup</p>
          <p className="mt-1 text-xs text-navy-500">A copy is emailed to the accounts mailbox automatically every Monday. You can also download one now: every job, client and engineer as one file. Contains client details — store it somewhere safe.</p>
          <button onClick={downloadBackup} className="btn-outline mt-2 py-1.5 text-xs">Download backup</button>
        </div>
        <div className="mt-4 border-t border-navy-100 pt-4">
          <button onClick={sendTest} disabled={test === "sending"} className="btn-outline py-1.5 text-xs disabled:opacity-50">
            <FiBell /> {test === "sending" ? "Sending…" : "Send test notification"}
          </button>
          <span className="ml-2 text-[11px] text-navy-400">Goes to every device you&apos;ve enabled — lock your phone first.</span>
          {test && test !== "sending" && (
            <div className="mt-3 space-y-1.5 text-xs">
              {test.error && <p className="font-semibold text-rose-600">{test.error}</p>}
              {test.note && <p className="text-navy-600">{test.note}</p>}
              {(test.devices || []).map((d, i) => (
                <p key={i} className={d.ok ? "text-brand-700" : "text-rose-600"}>
                  {d.ok ? "✓" : "✗"} <strong>{d.device}</strong>{" "}
                  {d.ok
                    ? "— accepted by the push service. If it didn't appear, check this device's notification settings for LCL Ops."
                    : d.removed
                      ? "— this device's subscription had expired and was removed. Turn notifications on again from that device."
                      : `— rejected: ${d.error}`}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function GmailPushSection() {
  const [status, setStatus] = useState("idle"); // idle | working | ok | error | unconfigured
  const [msg, setMsg] = useState("");

  const activate = useCallback(async () => {
    setStatus("working");
    setMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/gmail/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const out = await res.json().catch(() => ({}));
      if (out.notConfigured) {
        setStatus("unconfigured");
        setMsg("Gmail credentials not set up yet — run scripts/get-gmail-refresh-token.js to generate them.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        // "invalid_grant" / "Bad Request" here means the refresh token itself
        // has expired or been revoked (Google does this periodically, or
        // instantly if the OAuth app is in Testing publish status) — the fix
        // is re-running scripts/get-gmail-refresh-token.js, not a config
        // change in this app.
        const raw = out.error || "Could not start Gmail push.";
        const looksLikeExpiredToken = /invalid_grant|bad request/i.test(raw);
        setMsg(looksLikeExpiredToken
          ? `${raw} — the Gmail connection has expired. Run "node scripts/get-gmail-refresh-token.js" locally to reconnect, then redeploy.`
          : raw);
        return;
      }
      const exp = out.expiration
        ? new Date(parseInt(out.expiration)).toLocaleDateString("en-GB")
        : "~7 days";
      setStatus("ok");
      setMsg(`Gmail push active — renews by ${exp}. Replies will now land instantly.`);
    } catch (err) {
      setStatus("error");
      setMsg(`Request failed: ${err?.message || "unknown error"}. Check your connection and try again.`);
    }
  }, []);

  return (
    <section>
      <h2 className="mb-3 section-label text-sm">
        Gmail push notifications
      </h2>
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-900">
              Instant inbound email replies
            </p>
            <p className="measure mt-1 text-xs leading-relaxed text-navy-500">
              Google notifies LCL Ops the moment a client replies — replies appear in
              the job thread instantly instead of every 5 seconds. Requires a Gmail
              API + Pub/Sub setup (see <code className="text-navy-700">GMAIL_SETUP.md</code>).
              Re-activate every 7 days (or set a cron to auto-renew).
            </p>
            {msg && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  status === "ok" ? "text-brand-700" : "text-amber-700"
                }`}
              >
                {msg}
              </p>
            )}
          </div>
          <button
            onClick={activate}
            disabled={status === "working"}
            className="btn-outline shrink-0"
          >
            <FiMail />
            {status === "working"
              ? "Activating…"
              : status === "ok"
              ? "Renew"
              : "Activate"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsInner() {
  const ask = useConfirm();
  const {
    clients,
    jobs,
    catalog,
    servicePrices,
    updateServicePrice,
    updateServiceTierPrice,
    updateGasPrice,
    resetServicePrices,
    engineers,
    removeEngineer,
  } = useStore();

  // `?section=profile` (from the sidebar avatar) scrolls straight to Users &
  // access. Waits a frame so the section exists before we try to reach it.
  const settingsParams = useSearchParams();
  const deepLinked = settingsParams.get("section");
  useEffect(() => {
    const section = settingsParams.get("section");
    if (!section) return;
    const t = setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [settingsParams]);

  // Which section the hooked rail should point at.
  //
  // The nav is anchor links, so `usePathname` can never tell the component
  // which one is current — a hash isn't part of the pathname. Driven here
  // instead by what's actually on screen: the topmost section whose
  // heading has crossed the sticky header. rootMargin's -120px top edge is
  // that header's height, so a section counts as "current" when its title
  // reaches the top of the readable area, not when it first peeks in.
  const [activeSection, setActiveSection] = useState(0);
  useEffect(() => {
    const nodes = SETTINGS_NAV.map((sec) => document.getElementById(sec.id)).filter(Boolean);
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const i = SETTINGS_NAV.findIndex((sec) => sec.id === visible.target.id);
        if (i >= 0) setActiveSection(i);
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: 0 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const [engModalOpen, setEngModalOpen] = useState(false);
  const [editEngineer, setEditEngineer] = useState(null);
  const [removeEng, setRemoveEng] = useState(null);

  const openAddEngineer = () => {
    setEditEngineer(null);
    setEngModalOpen(true);
  };
  const openEditEngineer = (eng) => {
    setEditEngineer(eng);
    setEngModalOpen(true);
  };

  return (
    <>
      <PageHeader
        icon={FiSettings}
        title="Settings"
        subtitle="Team, services, integrations and data"
      />

      {/* Tight rhythm on a phone, where the sections are collapsed rows and a
          32px gutter between each makes an index look scattered. Desktop keeps
          the generous spacing between full, open sections. From lg up, a
          sticky sub-nav on the left replaces scrolling through all 9 open
          sections to find one. */}
      <div className="page lg:grid lg:grid-cols-[200px_1fr] lg:items-start lg:gap-10">
        {/* The 200px grid column is this nav's own space, so the rail has
            the ~20px left gutter it draws into without eating label width,
            and nothing is drawn outside the list box. Controlled by
            `value` rather than left to route-matching: these are anchor
            links, and a hash is not part of the pathname. */}
        <HookSidebar
          className="hidden lg:sticky lg:top-24 lg:flex"
          label="Settings"
          items={SETTINGS_NAV.map((sec) => ({ label: sec.label, href: `#${sec.id}` }))}
          value={activeSection}
          onChange={setActiveSection}
        />
        <div className="space-y-2.5 sm:space-y-6">
        <SettingsGroup title="Configuration" id="config">
          <BankAccounts />
  {/* Configuration shortcuts */}
          <section>
            <h2 className="mb-3 section-label text-sm">
              Configuration
            </h2>
            <Link
              href="/settings/email"
              className="card-hover flex items-center gap-4 p-5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
                <FiMail className="h-[18px] w-[18px]" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy-900">
                  Email configuration
                </p>
                <p className="text-xs text-navy-500">
                  Provider &amp; API key, sender identity, and templates for quotes,
                  bookings, invoices and renewal reminders.
                </p>
              </div>
              <FiChevronRight className="shrink-0 text-navy-400" />
            </Link>
          </section>
        </SettingsGroup>

        <SettingsGroup title="Users &amp; access" id="profile" openOnLoad={deepLinked === "profile"}>
  {/* Users & access */}
          <div id="profile" className="scroll-mt-24">
            <UserManagement />
          </div>
        </SettingsGroup>

        <SettingsGroup title="Engineers" id="engineers">
  {/* Engineers */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-label text-sm">
                Engineers
              </h2>
              <button className="btn-primary py-1.5 text-xs" onClick={openAddEngineer}>
                <FiPlus /> Add engineer
              </button>
            </div>
            {engineers.length === 0 ? (
              <div className="card p-8 text-center text-sm text-navy-500">
                No engineers yet. Add your gas, electrical and other engineers so you
                can assign jobs to them.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {engineers.map((e) => (
                  <div key={e.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: e.color }}
                      >
                        {e.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                          {e.name}
                          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">
                            {e.type || "Individual"}
                          </span>
                        </p>
                        {(e.trade || e.company) && (
                          <p className="truncate text-xs text-navy-500">
                            {[e.trade, e.company].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {e.phone && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-navy-600">
                            <FiPhone className="text-navy-400" /> {e.phone}
                          </p>
                        )}
                        {(e.postcode || e.areas) && (
                          <p className="text-xs text-navy-500">
                            {[e.postcode, e.areas].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {e.services && e.services.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {e.services.map((c) => (
                              <span
                                key={c}
                                className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
                              >
                                {serviceShort(c)}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-navy-500">
                          Pay:{" "}
                          <span className="font-semibold text-navy-700">
                            {e.payType === "weekly" ? `£${e.weeklyRate || 0}/week retainer`
                              : e.payType === "fixed_gas" ? "Fixed rate by appliance count"
                              : e.payType === "fixed_service" ? "Fixed rate per service"
                              : `${e.cutPercent != null ? e.cutPercent : 40}% of job value`}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-500 hover:border-brand-300 hover:text-brand-600"
                          onClick={() => openEditEngineer(e)}
                          aria-label={`Edit ${e.name}`}
                        >
                          <FiEdit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50"
                          onClick={() => setRemoveEng(e)}
                          aria-label={`Remove ${e.name}`}
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </SettingsGroup>

        <SettingsGroup title="Service catalogue &amp; pricing" id="services">
  {/* Service catalogue */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-label text-sm">
                Service catalogue &amp; pricing
              </h2>
              <button
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-800"
                onClick={resetServicePrices}
              >
                <FiRefreshCw className="h-3.5 w-3.5" /> Reset to defaults
              </button>
            </div>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-navy-500">
                <span>Service</span>
                <span>Price</span>
              </div>
              <ul className="divide-y divide-navy-100">
                {catalog.map((s) => {
                  // GAS — priced by appliance count, not a size tier: two
                  // editable numbers instead of one.
                  if (s.code === "GAS") {
                    return (
                      <li key={s.code} className="px-4 py-3">
                        <p className="mb-2 text-sm font-semibold text-navy-800">{s.name}</p>
                        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-navy-500">1st appliance</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">£</span>
                              <input
                                type="number" step="0.01" min="0"
                                className="input h-9 w-full pl-6 pr-2 text-right font-semibold text-navy-900"
                                value={servicePrices.GAS?.base ?? s.price}
                                onChange={(e) => updateGasPrice("base", e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-navy-500">Each extra appliance</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">£</span>
                              <input
                                type="number" step="0.01" min="0"
                                className="input h-9 w-full pl-6 pr-2 text-right font-semibold text-navy-900"
                                value={servicePrices.GAS?.extra ?? s.gasExtra}
                                onChange={(e) => updateGasPrice("extra", e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  // Tiered services (EICR/EPC/FRA/ALARM/FIREPANEL) — one
                  // editable price per property-size / count tier, matching
                  // exactly what the job-creation form shows when you pick a
                  // size. Was previously ONE flat number for the whole
                  // service, which had no way to reflect that a Studio and
                  // an 8-bedroom EICR are priced completely differently.
                  if (s.tiers?.length) {
                    return (
                      <li key={s.code} className="px-4 py-3">
                        <p className="mb-2 text-sm font-semibold text-navy-800">{s.name}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {s.tiers.map((t) => (
                            <div key={t.label}>
                              <label className="mb-1 block truncate text-[11px] font-semibold text-navy-500" title={t.label}>{t.label}</label>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">£</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  className="input h-9 w-full pl-6 pr-2 text-right text-sm font-semibold text-navy-900"
                                  value={servicePrices[s.code]?.[t.label] ?? t.price}
                                  onChange={(e) => updateServiceTierPrice(s.code, t.label, e.target.value)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  }

                  // Flat services (PAT, BOILER, EMLIGHT, FSC) — unchanged,
                  // one price for the whole service.
                  return (
                    <li key={s.code} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <p className="truncate text-sm text-navy-700">{s.name}</p>
                      <div className="relative shrink-0">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400">£</span>
                        <input
                          type="number" step="0.01" min="0"
                          className="input h-9 w-28 pl-6 pr-2 text-right font-semibold text-navy-900"
                          value={servicePrices[s.code] ?? s.price}
                          onChange={(e) => updateServicePrice(s.code, e.target.value)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="mt-2 text-xs text-navy-400">
              These are the prices used when you add a service to a job — every size/count tier is
              editable individually, not just one default. You
              can still override the price on any individual job.
            </p>
          </section>
        </SettingsGroup>

        <SettingsGroup title="Urgent outreach alerts" id="push">
  {/* Urgent outreach push notifications (phone + laptop) */}
          <PushNotificationsSection />
        </SettingsGroup>

        <SettingsGroup title="Auto-notifications" id="auto-notify">
  {/* Auto-notifications */}
          <AutoNotifySection />
        </SettingsGroup>

        <SettingsGroup title="Gmail push notifications" id="gmail">
  {/* Gmail push notifications */}
          <GmailPushSection />
        </SettingsGroup>

        <SettingsGroup title="Integrations roadmap" id="integrations">
  {/* Integrations roadmap */}
          <section>
            <h2 className="mb-3 section-label text-sm">
              Integrations roadmap
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {integrations.map((it) => {
                const Icon = it.icon;
                return (
                  <div key={it.name} className="card p-4">
                    <div className="flex items-center justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy-50 text-navy-600">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        it.phase === "Live"
                          ? "bg-brand-500 text-white"
                          : it.phase === "Phase 2"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-navy-100 text-navy-500"
                      }`}>
                        {it.phase === "Live" ? "● Live" : it.phase}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-navy-900">{it.name}</p>
                    <p className="measure mt-1 text-xs leading-relaxed text-navy-500">{it.desc}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </SettingsGroup>

        <SettingsGroup title="Data" id="data">
  {/* Data */}
          <section>
            <h2 className="mb-3 section-label text-sm">
              Data
            </h2>
            <div className="card flex flex-col gap-3 p-5">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                  <FiCheckCircle className="text-brand-500" />
                  {clients.length} clients · {jobs.length} jobs
                </p>
                {/* This card used to say records were "saved in this browser"
                    and offer a "Reset demo data" button. Both were leftovers
                    from the prototype and both were untrue/unsafe now: the
                    records live in Supabase and sync across every device, and
                    the reset button DELETED every client and job on the server
                    before replacing them with invented demo records. */}
                <p className="mt-1 text-xs text-navy-500">
                  Stored in your Supabase workspace and synced across every device
                  you sign in on. This device keeps an offline copy so the app still
                  opens without a connection.
                </p>
              </div>
            </div>

            {/* Nuclear option — for when a device is stuck showing ghost data.
                Clears every browser-local store (IndexedDB caches, localStorage
                prefs, service worker registration + all HTTP caches) and hard-
                reloads. On the next load the app pulls a fresh copy from
                Supabase with zero local state to interfere. */}
            <div className="card mt-3 flex flex-col gap-3 border-rose-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-navy-900">Force a fresh sync from the cloud</p>
                <p className="mt-1 text-xs text-navy-500">
                  Use this if this device is showing old / deleted / ghost data that shouldn&apos;t be there
                  (e.g. a job you deleted keeps coming back, prospects aren&apos;t loading, etc). Wipes
                  every browser-local cache on this device only — Supabase is untouched — then reloads.
                </p>
              </div>
              <button
                className="btn-outline shrink-0"
                onClick={async () => {
                  if (!await ask("Wipe this device's local caches and reload fresh from Supabase? Your Supabase data (jobs, clients, prospects, etc.) is untouched — only this browser's cached copies are cleared. Your login session is preserved so you stay signed in. Continue?")) return;
                  try {
                    // 1. IndexedDB — job/client/prospect caches + local tombstones.
                    //    The Supabase auth session is stored in localStorage,
                    //    NOT here, so deleting these is safe.
                    if (typeof indexedDB !== "undefined") {
                      try { indexedDB.deleteDatabase("lcl-ops-cache"); } catch {}
                    }
                    // 2. localStorage — preserve Supabase auth tokens (sb-*-auth-token
                    //    and related keys) so the user stays signed in. Only wipe
                    //    keys we set ourselves (lcl-*, lcl_*). A blanket
                    //    localStorage.clear() was signing users out and leaving
                    //    them staring at empty pages until they re-logged in.
                    try {
                      const toRemove = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (!k) continue;
                        if (k.startsWith("sb-")) continue;             // Supabase auth
                        if (k.startsWith("supabase.")) continue;       // legacy Supabase key
                        toRemove.push(k);
                      }
                      for (const k of toRemove) localStorage.removeItem(k);
                    } catch {}
                    try { sessionStorage.clear(); } catch {}
                    // 3. Service worker caches (static assets only — Next.js JS
                    //    chunks aren't cached here, but the offline shell is).
                    if ("caches" in window) {
                      try {
                        const names = await caches.keys();
                        await Promise.all(names.map((n) => caches.delete(n)));
                      } catch {}
                    }
                    // 4. Unregister the service worker outright. Leaving it
                    // registered and relying on its own background update
                    // check was NOT reliable enough in practice — installed
                    // Safari Web Apps (macOS "Add to Dock", which is what the
                    // desktop icon actually is) run in a storage partition
                    // completely separate from regular Safari tabs, and its SW
                    // update check can sit stale for a long time even across
                    // quit/reopen. Unregistering forces the very next load to
                    // fetch and install the current worker from scratch — one
                    // extra reload, but it's the only way to GUARANTEE fresh
                    // code on a device that's stuck.
                    if ("serviceWorker" in navigator) {
                      try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map((r) => r.unregister()));
                      } catch {}
                    }
                  } finally {
                    // Hard reload — bust the HTTP cache with a query-param cachebuster.
                    location.replace(location.pathname + "?_purge=" + Date.now());
                  }
                }}
              >
                <FiRefreshCw /> Reset local data + reload
              </button>
            </div>
          </section>
        </SettingsGroup>
        </div>
      </div>

      <EngineerModal
        open={engModalOpen}
        onClose={() => setEngModalOpen(false)}
        engineer={editEngineer}
      />

      <Modal
        open={!!removeEng}
        onClose={() => setRemoveEng(null)}
        title="Remove engineer?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setRemoveEng(null)}>
              Cancel
            </button>
            <button
              className="btn bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                removeEngineer(removeEng.id);
                setRemoveEng(null);
              }}
            >
              Remove {removeEng?.name}
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes <strong>{removeEng?.name}</strong> from your roster. Any jobs
          assigned to them will be set back to <strong>Unassigned</strong>.
        </p>
      </Modal>

    </>
  );
}
