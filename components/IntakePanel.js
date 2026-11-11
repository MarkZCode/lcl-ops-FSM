"use client";

// Job details — all details related to Client, Status, Engineers, and Service
// requirements displayed and editable directly within this section.
import AddressInput from "@/components/AddressInput";
import PostcodeInput from "@/components/PostcodeInput";
import ClientModal from "@/components/ClientModal";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { FaWhatsapp } from "react-icons/fa";
import {
  FiCopy,
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit2,
  FiPlus,
  FiPhone,
  FiMail,
  FiMapPin,
  FiUser,
  FiCalendar,
  FiClock,
  FiUserCheck,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { intakeFieldsFor, quoteMissing, bookingMissing } from "@/lib/gates";
import { greetingNow, firstName, jobSender, SENDERS } from "@/lib/email";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { serviceShort, isAddonCode } from "@/lib/format";
import { toast } from "@/lib/toast";
import { serviceSentence, staffNote } from "@/lib/enquiryMessages";
import {
  STATUS_ORDER,
  statusMeta,
  TIME_PARTS,
  WINDOW_PRESETS,
  CALL_BEFORE_OPTIONS,
} from "@/lib/constants";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";
import { jobStage } from "@/lib/stages";

export const URGENCY_REASONS = [
  "Tenant moving in",
  "Failed certificate — needed before occupation",
  "Council / licensing deadline",
  "Agent deadline",
  "Property sale or remortgage",
  "Safety concern",
];
export const NO_ACCESS_FEE_DEFAULT = 20;

const sentence = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function toDateInput(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
  } catch {
    return "";
  }
}

export default function IntakePanel({
  job,
  client,
  property,
  onChangeStatus,
  onCancelJob,
  onReschedule,
}) {
  const { updateJob, updateClient, clients = [], engineers = [], engineerById, logActivity, rules } = useStore();
  const feeDefault = Number(rules?.noAccessFee) || NO_ACCESS_FEE_DEFAULT;
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  // Client modal state for editing client
  const [editClientOpen, setEditClientOpen] = useState(false);

  // Inline "+ Add property" state
  const [addingProperty, setAddingProperty] = useState(false);
  const [newProperty, setNewProperty] = useState({ label: "", postcode: "" });

  // "Open job details" on the Next step card opens the panel as well.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("lcl-open-job-details", show);
    return () => window.removeEventListener("lcl-open-job-details", show);
  }, []);

  if (!job) return null;

  const activeProperty = (client?.properties || []).find((p) => p.id === job.propertyId) || property;

  // The address and postcode live on the client's property.
  const setProperty = (patch) => {
    if (!client || !activeProperty) return;
    updateClient(client.id, {
      properties: (client.properties || []).map((p) => (p.id === activeProperty.id ? { ...p, ...patch } : p)),
    });
  };

  const intake = job.intake || {};
  const fields = intakeFieldsFor(job);
  const quoting = job.status === "quote" && !job.acceptedAt;
  const needQuote = quoteMissing(job, { client, property: activeProperty }, { all: !quoting });
  const needBooking = bookingMissing(job, { client, property: activeProperty });
  const missing = quoting
    ? needQuote
    : [...needBooking, ...needQuote.filter((q) => !needBooking.some((b) => b.key === q.key))];

  const setIntakeField = (field, value) => updateJob(job.id, { intake: { ...intake, [field]: value } });

  // Client change handler
  const handleClientSelect = (newClientId) => {
    if (!newClientId || newClientId === job.clientId) return;
    const nextClient = clients.find((c) => c.id === newClientId);
    const firstPropId = nextClient?.properties?.[0]?.id || "";
    updateJob(job.id, {
      clientId: newClientId,
      propertyId: firstPropId,
    });
    toast.success(`Client updated to ${nextClient?.name || "selected client"}`);
  };

  // Add property to current client
  const handleSaveNewProperty = () => {
    const label = newProperty.label.trim();
    const postcode = newProperty.postcode.trim().toUpperCase();
    if (!label && !postcode) return;
    if (!client) {
      toast.error("Please select a client first");
      return;
    }
    const propId = "pr-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const created = {
      id: propId,
      label: label || postcode,
      postcode,
      area: "",
      beds: 0,
    };
    const updatedProps = [...(client.properties || []), created];
    updateClient(client.id, { properties: updatedProps });
    updateJob(job.id, { propertyId: propId });
    setAddingProperty(false);
    setNewProperty({ label: "", postcode: "" });
    toast.success("New property added and selected");
  };

  // Status change handler
  const handleStatusSelect = (newStatus) => {
    if (newStatus === "cancelled") {
      if (onCancelJob) {
        onCancelJob();
      } else {
        updateJob(job.id, { status: "cancelled" });
      }
      return;
    }
    if (onChangeStatus) {
      onChangeStatus(newStatus);
    } else {
      updateJob(job.id, { status: newStatus });
      toast.success(`Status set to ${statusMeta(newStatus).label}`);
    }
  };

  // Engineer assignment handler
  const handleEngineerSelect = (engineerId) => {
    updateJob(job.id, { engineerId });
    const eng = engineerById?.(engineerId);
    logActivity?.(job.id, {
      type: "status",
      title: `Assigned engineer changed to ${eng?.name || engineerId}`,
      by: user?.name || user?.username || "",
    });
    toast.success(`Engineer assigned: ${eng?.name || "Unassigned"}`);
  };

  // Scheduled date change handler
  const handleDateChange = (dateStr) => {
    const windowStart = job.windowFrom || "09:00";
    const scheduledAt = dateStr ? ukDateTimeToUtcIso(dateStr, windowStart) : null;
    updateJob(job.id, {
      scheduledDate: dateStr,
      scheduledAt,
    });
  };

  // Part of day window preset handler
  const handlePartChange = (part) => {
    const preset = WINDOW_PRESETS[part];
    const windowFrom = preset?.from || job.windowFrom || "09:00";
    const windowTo = preset?.to || job.windowTo || "13:00";
    const dateStr = job.scheduledDate || toDateInput(job.scheduledAt);
    const scheduledAt = dateStr ? ukDateTimeToUtcIso(dateStr, windowFrom) : job.scheduledAt;
    updateJob(job.id, {
      windowPart: part,
      windowFrom,
      windowTo,
      ...(scheduledAt ? { scheduledAt } : {}),
    });
  };

  // Time window change handler
  const handleTimeChange = (field, val) => {
    const windowFrom = field === "windowFrom" ? val : (job.windowFrom || "09:00");
    const windowTo = field === "windowTo" ? val : (job.windowTo || "13:00");
    const dateStr = job.scheduledDate || toDateInput(job.scheduledAt);
    const scheduledAt = dateStr ? ukDateTimeToUtcIso(dateStr, windowFrom) : job.scheduledAt;
    updateJob(job.id, {
      [field]: val,
      ...(scheduledAt ? { scheduledAt } : {}),
    });
  };

  // Missing text generator
  const askText = () => {
    const what = `${serviceSentence(job) || (job.services || []).filter((c) => !isAddonCode(c)).map(serviceShort).join(" and ") || "your enquiry"}${activeProperty?.postcode ? ` at ${activeProperty.postcode}` : ""}`;
    const lines = missing.map((m) => `• ${m.label.replace(/^./, (c) => c.toUpperCase())}`);
    return `${greetingNow()} ${firstName(client?.name)}, ${jobSender(job)} here from Landlord Compliance London. Thank you for your enquiry regarding ${/^your enquiry/.test(what) ? what : `a ${what}`}.\n\nWe'd be happy to arrange this for you. Could you please confirm:\n${lines.join("\n")}\n\nOnce confirmed, we can provide the exact quote and available appointment times.`;
  };

  const ask = (how) => {
    const msg = askText();
    if (how === "wa") {
      if (!openWhatsAppChat(client?.phone, msg)) { toast.error("No phone number for this client."); return; }
    } else {
      navigator.clipboard.writeText(msg).then(() => toast.success("Message copied.")).catch(() => {});
    }
    updateJob(job.id, { detailsRequestedAt: new Date().toISOString() });
    logActivity?.(job.id, {
      type: how === "wa" ? "whatsapp" : "note",
      title: `Asked the client for missing details (${sentence(missing.map((m) => m.key))})`,
      detail: msg,
      by: user?.name || user?.username || "",
    });
  };

  const scheduledDateVal = job.scheduledDate || toDateInput(job.scheduledAt);

  return (
    <section className="card p-5">
      {job.status === "quote" && (
        <button
          type="button"
          className="float-right ml-3 text-xs font-semibold text-navy-500 underline"
          onClick={() =>
            navigator.clipboard
              .writeText(staffNote({ job, client, property: activeProperty }))
              .then(() => toast.success("Staff note copied."))
              .catch(() => {})
          }
        >
          Copy staff note
        </button>
      )}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="section-label text-sm">Job details</span>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            missing.length ? "text-amber-700" : "text-brand-700"
          }`}
        >
          {missing.length ? (
            <>
              <FiAlertTriangle /> {missing.length} still needed
            </>
          ) : (
            <>
              <FiCheckCircle /> Everything needed is here
            </>
          )}
          <span className="ml-1 text-navy-400">{open ? "Hide" : "Open"}</span>
        </span>
      </button>

      {missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs dark:bg-amber-500/10">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Still needed {job.status === "quote" && !job.acceptedAt ? "to quote properly" : "before this can be booked"}:
          </p>
          <p className="mt-1 text-amber-900 dark:text-amber-100">{sentence(missing.map((m) => m.label))}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {client?.phone && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 font-semibold text-white hover:bg-[#1ebe5b]"
                onClick={() => ask("wa")}
              >
                <FaWhatsapp /> Ask on WhatsApp
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 font-semibold text-navy-700 dark:bg-transparent"
              onClick={() => ask("copy")}
            >
              <FiCopy /> Copy the message
            </button>
            {job.detailsRequestedAt && (
              <span className="self-center text-navy-500">
                Asked {new Date(job.detailsRequestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-6 text-sm">
          {/* ================= 1. CLIENT & PROPERTY ================= */}
          <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/40">
            <div className="mb-3 flex items-center justify-between border-b border-navy-100 pb-2 dark:border-white/10">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-navy-300">
                <FiUser className="text-brand-500" /> Client &amp; Property
              </h3>
              {client && (
                <Link
                  href={`/clients/${client.id}`}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  View client profile →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Client Selection */}
              <div>
                <label className="label mb-1">Client</label>
                <div className="flex items-stretch gap-2">
                  <select
                    className="input min-w-0 flex-1 font-medium"
                    value={job.clientId || ""}
                    onChange={(e) => handleClientSelect(e.target.value)}
                  >
                    <option value="">Select client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` (${c.company})` : ""}
                      </option>
                    ))}
                  </select>
                  {client && (
                    <button
                      type="button"
                      onClick={() => setEditClientOpen(true)}
                      className="btn-outline shrink-0 px-3 py-2 text-xs"
                      title="Edit this client's profile & details"
                    >
                      <FiEdit2 />
                    </button>
                  )}
                </div>
              </div>

              {/* Property Selection */}
              <div>
                <label className="label mb-1">Property</label>
                {!addingProperty ? (
                  <div className="flex items-stretch gap-2">
                    <select
                      className="input min-w-0 flex-1"
                      value={job.propertyId || ""}
                      onChange={(e) => updateJob(job.id, { propertyId: e.target.value })}
                      disabled={!client?.properties?.length}
                    >
                      <option value="">
                        {client?.properties?.length ? "Select property…" : "No properties on file"}
                      </option>
                      {(client?.properties || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.postcode}
                        </option>
                      ))}
                    </select>
                    {client && (
                      <button
                        type="button"
                        onClick={() => setAddingProperty(true)}
                        className="btn-outline shrink-0 whitespace-nowrap px-3 py-2 text-xs"
                      >
                        + Add property
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 dark:border-brand-800 dark:bg-brand-950/20">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                        New property for {client?.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingProperty(false);
                          setNewProperty({ label: "", postcode: "" });
                        }}
                        className="text-xs text-navy-400 hover:text-navy-600"
                      >
                        Cancel
                      </button>
                    </div>
                    <AddressInput
                      className="input h-9 text-sm"
                      placeholder="Property address — start typing to pick"
                      value={newProperty.label}
                      postcode={newProperty.postcode}
                      onChange={(v) => setNewProperty((p) => ({ ...p, label: v }))}
                      onPick={(o) => o.postcode && setNewProperty((p) => ({ ...p, postcode: p.postcode || o.postcode }))}
                      autoFocus
                    />
                    <PostcodeInput
                      className="input h-9 text-sm"
                      placeholder="Postcode"
                      value={newProperty.postcode}
                      onChange={(v) => setNewProperty((p) => ({ ...p, postcode: v }))}
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveNewProperty}
                        disabled={!newProperty.label.trim() && !newProperty.postcode.trim()}
                        className="btn-primary py-1 px-3 text-xs"
                      >
                        Save property
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Full Address */}
              <div className="sm:col-span-2">
                <label className="label">Full property address</label>
                <AddressField property={activeProperty} onSave={setProperty} />
              </div>

              {/* Postcode & Name on cert */}
              <div>
                <label className="label">Postcode</label>
                <input
                  className="input uppercase"
                  defaultValue={activeProperty?.postcode || ""}
                  key={`pc-${activeProperty?.postcode || ""}`}
                  disabled={!activeProperty}
                  onBlur={(e) =>
                    e.target.value.trim().toUpperCase() !== (activeProperty?.postcode || "") &&
                    setProperty({ postcode: e.target.value.trim().toUpperCase() })
                  }
                />
              </div>

              <div>
                <label className="label">Name on certificate</label>
                <input
                  className="input"
                  defaultValue={job.nameOnCert || ""}
                  placeholder={client?.name || "Who cert is issued to"}
                  onBlur={(e) =>
                    e.target.value !== (job.nameOnCert || "") &&
                    updateJob(job.id, { nameOnCert: e.target.value.trim() })
                  }
                />
              </div>

              {/* Access contacts */}
              <div>
                <label className="label">Who gives access</label>
                <input
                  className="input"
                  defaultValue={job.accessName || ""}
                  placeholder={client?.name || "Tenant or contact name"}
                  onBlur={(e) =>
                    e.target.value.trim() !== (job.accessName || "") &&
                    updateJob(job.id, { accessName: e.target.value.trim() })
                  }
                />
              </div>

              <div>
                <label className="label">Their phone number</label>
                <input
                  className="input"
                  inputMode="tel"
                  defaultValue={job.accessPhone || ""}
                  placeholder={client?.phone || "Access contact phone"}
                  onBlur={(e) =>
                    e.target.value.trim() !== (job.accessPhone || "") &&
                    updateJob(job.id, { accessPhone: e.target.value.trim() })
                  }
                />
              </div>

              {/* Client Contact Phone & Email */}
              <div>
                <label className="label">Client phone number</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    inputMode="tel"
                    defaultValue={client?.phone || ""}
                    key={`ph-${client?.phone || ""}`}
                    disabled={!client}
                    onBlur={(e) =>
                      client &&
                      e.target.value.trim() !== (client.phone || "") &&
                      updateClient(client.id, { phone: e.target.value.trim() })
                    }
                  />
                  {client?.phone && (
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(client.phone)}
                      className="btn-outline px-2.5 py-2 text-xs text-[#25D366] hover:bg-emerald-50"
                      title="Open WhatsApp chat"
                    >
                      <FaWhatsapp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Client email</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    className="input flex-1"
                    defaultValue={client?.email || ""}
                    key={`em-${client?.email || ""}`}
                    disabled={!client}
                    onBlur={(e) =>
                      client &&
                      e.target.value.trim() !== (client.email || "") &&
                      updateClient(client.id, { email: e.target.value.trim() })
                    }
                  />
                  {client?.email && (
                    <a
                      href={`mailto:${client.email}`}
                      className="btn-outline px-2.5 py-2 text-xs text-navy-600 hover:text-brand-600"
                      title="Send email"
                    >
                      <FiMail className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ================= 2. STATUS & SCHEDULE ================= */}
          <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/40">
            <div className="mb-3 flex items-center justify-between border-b border-navy-100 pb-2 dark:border-white/10">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-navy-300">
                <FiCalendar className="text-blue-500" /> Status &amp; Schedule
              </h3>
              <span className={`pill font-semibold text-xs ${statusMeta(job.status)?.pill || "pill-neutral"}`}>
                {statusMeta(job.status)?.label || job.status}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Job status</label>
                <select
                  className="input font-semibold"
                  value={job.status}
                  onChange={(e) => handleStatusSelect(e.target.value)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {statusMeta(s).label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Messages signed by</label>
                <select
                  className="input"
                  value={job.senderName || ""}
                  onChange={(e) => updateJob(job.id, { senderName: e.target.value })}
                >
                  <option value="">Automatic ({jobSender({ id: job.id })})</option>
                  {SENDERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Is it urgent? Why</label>
                <select
                  className="input"
                  value={job.urgencyReason || ""}
                  onChange={(e) => updateJob(job.id, { urgencyReason: e.target.value })}
                >
                  <option value="">Not urgent</option>
                  {URGENCY_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Client deadline</label>
                <input
                  type="date"
                  className="input"
                  value={job.deadline || ""}
                  onChange={(e) => updateJob(job.id, { deadline: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex flex-wrap items-center gap-2 text-xs text-navy-700 dark:text-navy-300">
                  <input
                    type="checkbox"
                    checked={!!job.noAccessFee}
                    onChange={(e) => updateJob(job.id, { noAccessFee: e.target.checked ? feeDefault : 0 })}
                  />
                  A no-access fee applies to this job
                  {!!job.noAccessFee && (
                    <>
                      : £
                      <input
                        type="number"
                        min="0"
                        className="input h-8 w-20 py-0 text-xs"
                        defaultValue={job.noAccessFee}
                        onBlur={(e) =>
                          Number(e.target.value) !== job.noAccessFee &&
                          updateJob(job.id, { noAccessFee: Number(e.target.value) || feeDefault })
                        }
                      />
                      <span className="text-navy-500">— stated on the quote</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* ================= 3. ENGINEER & APPOINTMENT ================= */}
          <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/40">
            <div className="mb-3 flex items-center justify-between border-b border-navy-100 pb-2 dark:border-white/10">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-navy-300">
                <FiUserCheck className="text-emerald-500" /> Engineer &amp; Appointment
              </h3>
              {onReschedule && (
                <button
                  type="button"
                  onClick={onReschedule}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Reschedule helper →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Engineer select */}
              <div>
                <label className="label">Assigned engineer</label>
                <select
                  className="input font-semibold"
                  value={job.engineerId || "unassigned"}
                  onChange={(e) => handleEngineerSelect(e.target.value)}
                >
                  <option value="unassigned">Unassigned</option>
                  {engineers.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.trade ? ` · ${e.trade}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Call Before Instruction */}
              <div>
                <label className="label">Call before attending</label>
                <select
                  className="input"
                  value={job.callBefore || ""}
                  onChange={(e) => updateJob(job.id, { callBefore: e.target.value })}
                >
                  <option value="">No call instruction</option>
                  {CALL_BEFORE_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Arrival Date */}
              <div>
                <label className="label">Arrival date</label>
                <input
                  type="date"
                  className="input"
                  value={scheduledDateVal}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>

              {/* Part of Day */}
              <div>
                <label className="label">Part of day</label>
                <select
                  className="input"
                  value={job.windowPart || ""}
                  onChange={(e) => handlePartChange(e.target.value)}
                >
                  <option value="">—</option>
                  {TIME_PARTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Window */}
              <div>
                <label className="label">Time window (arrival)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="input flex-1 px-2 text-center"
                    value={job.windowFrom || ""}
                    onChange={(e) => handleTimeChange("windowFrom", e.target.value)}
                  />
                  <span className="text-navy-400">–</span>
                  <input
                    type="time"
                    className="input flex-1 px-2 text-center"
                    value={job.windowTo || ""}
                    onChange={(e) => handleTimeChange("windowTo", e.target.value)}
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="label">Expected duration (minutes)</label>
                <input
                  type="number"
                  min="0"
                  step="15"
                  className="input"
                  value={job.durationMinutes ?? ""}
                  placeholder="e.g. 60"
                  onChange={(e) => updateJob(job.id, { durationMinutes: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          {/* ================= 4. SERVICE REQUIREMENTS ================= */}
          {fields.length > 0 && (
            <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/40">
              <div className="mb-3 border-b border-navy-100 pb-2 dark:border-white/10">
                <h3 className="text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-navy-300">
                  Service Requirements
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.field} className={f.input === "chips" || f.input === "text" ? "sm:col-span-2" : ""}>
                    <label className="label">{f.title}</label>
                    {f.input === "number" && (() => {
                      const fallbackBeds =
                        f.field === "bedrooms"
                          ? (intake.bedrooms ??
                            (job.lineItems || []).find((l) => ["EICR", "FRA"].includes(l.code))?.bedroomCount ??
                            parseInt((job.lineItems || []).find((l) => ["EICR", "FRA"].includes(l.code))?.tier) ??
                            (activeProperty?.beds > 0 ? activeProperty.beds : ""))
                          : "";
                      const val = intake[f.field] ?? fallbackBeds;
                      return (
                        <input
                          type="number"
                          min="0"
                          className="input"
                          defaultValue={val ?? ""}
                          onBlur={(e) =>
                            e.target.value !== String(intake[f.field] ?? "") &&
                            setIntakeField(f.field, e.target.value === "" ? "" : Number(e.target.value))
                          }
                        />
                      );
                    })()}
                    {f.input === "text" && (
                      <input
                        className="input"
                        defaultValue={intake[f.field] || ""}
                        onBlur={(e) =>
                          e.target.value !== (intake[f.field] || "") &&
                          setIntakeField(f.field, e.target.value.trim())
                        }
                      />
                    )}
                    {f.input === "yesno" && (
                      <div className="flex gap-2">
                        {["Yes", "No"].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setIntakeField(f.field, v)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                              intake[f.field] === v
                                ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
                                : "border-navy-200 text-navy-600 dark:border-white/10 dark:text-navy-300"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                    {f.input === "chips" && (
                      <div className="flex flex-wrap gap-2">
                        {f.options.map((o) => {
                          const on = (intake[f.field] || []).includes(o);
                          return (
                            <button
                              key={o}
                              type="button"
                              onClick={() =>
                                setIntakeField(
                                  f.field,
                                  on
                                    ? intake[f.field].filter((x) => x !== o)
                                    : [...(intake[f.field] || []), o]
                                )
                              }
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                                on
                                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
                                  : "border-navy-200 text-navy-600 dark:border-white/10 dark:text-navy-300"
                              }`}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Client Modal */}
      <ClientModal
        open={editClientOpen}
        onClose={() => setEditClientOpen(false)}
        client={client}
      />
    </section>
  );
}

// The address box with suggestions. Saved when one is picked (with its
// postcode if the property has none) or when you leave the box.
function AddressField({ property, onSave }) {
  const [v, setV] = useState(property?.label || "");
  useEffect(() => {
    setV(property?.label || "");
  }, [property?.label]);
  return (
    <AddressInput
      value={v}
      onChange={setV}
      postcode={property?.postcode || ""}
      disabled={!property}
      placeholder="Flat / house number and street — start typing to pick"
      onPick={(o) =>
        onSave({ label: o.label, ...(!property?.postcode && o.postcode ? { postcode: o.postcode } : {}) })
      }
      onBlur={(e) => e.target.value.trim() !== (property?.label || "") && onSave({ label: e.target.value.trim() })}
    />
  );
}
