"use client";

import { useEffect, useRef, useState } from "react";
import {
  FiSend,
  FiMessageSquare,
  FiPaperclip,
  FiDollarSign,
  FiActivity,
  FiDownload,
  FiPlus,
  FiRefreshCw,
  FiCornerDownLeft,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { playPing } from "@/lib/sound";
import { fmtDate, fmtTime } from "@/lib/format";
import { uploadFile, fileSrc } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";

const MAX_FILE = 9 * 1024 * 1024; // 9MB cap (Supabase Storage)

// Strip quoted email chains — keep only the fresh reply text.
// Removes "> …" quoted lines and "On … wrote:" reply headers.
function cleanReplyText(text = "") {
  return text
    .split("\n")
    .reduce((lines, line) => {
      // Stop at the first "On [date] ... wrote:" line.
      if (/^On .{10,} wrote:/.test(line.trim())) return { done: true, acc: lines.acc };
      if (lines.done) return lines;
      // Drop quoted ">" lines.
      if (/^\s*>/.test(line)) return lines;
      return { ...lines, acc: [...lines.acc, line] };
    }, { done: false, acc: [] })
    .acc
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ICONS = {
  email: FiSend,
  note: FiMessageSquare,
  payment: FiDollarSign,
  file: FiPaperclip,
  status: FiActivity,
};

export default function ActivityThread({ job, client }) {
  const { logActivity } = useStore();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null); // { name, dataUrl }
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const fileRef = useRef(null);
  const inFlight = useRef(false);
  const justAddedIds = useRef(new Set()); // prevent dupes if spam-clicked before React re-renders

  // Pull the client's recent email replies from the inbox into the thread.
  // silent = background poll (no status text, no spinner spam).
  const checkReplies = async (silent = false) => {
    if (inFlight.current) return;
    if (!client?.email) {
      if (!silent) setCheckMsg("No client email on file.");
      return;
    }
    inFlight.current = true;
    if (!silent) {
      setCheckMsg("");
      setChecking(true);
    }
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/client-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientEmail: client.email }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) setCheckMsg(out.error || "Could not check for replies.");
        return;
      }
      const existing = job.activity || [];
      const seenIds = new Set(existing.map((a) => a.meta?.messageId).filter(Boolean));
      // Track date+snippet fingerprints so we don't dedup by messageId alone
      const seenFingerprints = new Set(
        existing.map((a) => `${a.at}|${(a.detail || "").slice(0, 40)}`)
      );
      // Legacy auto-sent emails didn't have a messageId, so we dedup them by subject
      const existingLegacySubjects = new Set(
        existing.filter(a => a.type === "email" && !a.meta?.messageId).map(a => (a.detail || "").toLowerCase().trim())
      );

      let added = 0;
      for (const m of out.messages || []) {
        const clientEmailLower = (client.email || "").toLowerCase();
        const inbound = (m.from || "").toLowerCase().includes(clientEmailLower);
        const detailRaw = inbound ? cleanReplyText(m.snippet || "") : (m.snippet || "");
        const fingerprint = `${m.date}|${detailRaw.slice(0, 40)}`;

        if (seenIds.has(m.messageId) || seenFingerprints.has(fingerprint) || justAddedIds.current.has(m.messageId)) continue;

        justAddedIds.current.add(m.messageId);

        // If it's an outbound email, skip if we already have a legacy log with the same subject
        if (!inbound) {
          const subjectLower = (m.subject || "").toLowerCase().trim();
          if (existingLegacySubjects.has(subjectLower)) continue;
        }

        logActivity(job.id, {
          type: "email",
          direction: inbound ? "in" : "out",
          title: inbound ? "Reply from client" : "Email sent (synced)",
          detail: detailRaw,
          by: inbound ? (client.name || m.from) : "Agent / System",
          to: inbound ? undefined : client.email,
          at: m.date,
          meta: { messageId: m.messageId },
        });
        added += 1;
      }
      if (added > 0) {
        playPing();
        toast(
          `${added} new email${added === 1 ? "" : "s"} synced`,
          "info"
        );
      }
      if (!silent) {
        setCheckMsg(
          added ? `${added} new email${added === 1 ? "" : "s"} added.` : "No new emails found."
        );
      }
    } catch (err) {
      console.error("Fetch error checking inbox:", err);
      if (!silent) setCheckMsg(`Error: ${err.message || String(err)}`);
    } finally {
      inFlight.current = false;
      if (!silent) setChecking(false);
    }
  };

  // Check once on open, then poll every 30s while the tab is visible.
  useEffect(() => {
    if (!client?.email) return;
    checkReplies(true);
    const id = setInterval(() => {
      if (!document.hidden) checkReplies(true);
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, client?.email]);

  const { patchJobLocal } = useStore();
  const activityRef = useRef(job.activity || []);
  activityRef.current = job.activity || [];

  const entries = [...(job.activity || [])].sort(
    (a, b) => new Date(a.at) - new Date(b.at)
  );

  // Who spoke last, at a glance: our last message to the client and their
  // last word to us. Saves scrolling the thread to answer "have we replied?"
  const ago = (iso) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };
  const lastOut = [...entries].reverse().find((e) => e.direction !== "in" && ["email", "whatsapp", "call"].includes(e.type));
  const lastIn = [...entries].reverse().find((e) => e.direction === "in" || e.by === "client" || e.by === "website");
  const waitingOnUs = lastIn && (!lastOut || new Date(lastIn.at) > new Date(lastOut.at));

  // Open at the newest message, not the oldest.
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.id, entries.length]);

  const pickFile = async (e) => {
    setErr("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE) {
      setErr("File too large (max 9MB).");
      return;
    }
    const up = await uploadFile(f, `activity/${job.id}`);
    setFile(up);
  };

  const submit = () => {
    if (!text.trim() && !file) return;
    logActivity(job.id, {
      type: file ? "file" : "note",
      title: file ? "File / note logged" : "Note",
      detail: text.trim(),
      by: user?.name || "",
      file: file || null,
    });
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="card flex max-h-[680px] flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 section-label text-sm">
          <FiMessageSquare /> Communication
        </h2>
        <button
          onClick={() => checkReplies(false)}
          disabled={checking}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
          title="Pull recent email replies from this client"
        >
          <FiRefreshCw className={checking ? "animate-spin" : ""} />
          {checking ? "Checking…" : "Check for replies"}
        </button>
      </div>
      {(lastOut || lastIn) && (
        <p className={`mb-2 rounded-lg px-2.5 py-1.5 text-[11px] ${waitingOnUs ? "bg-amber-50 text-amber-800" : "bg-navy-50 text-navy-500"}`}>
          {lastOut ? <>We last {lastOut.type === "call" ? "called" : lastOut.type === "whatsapp" ? "WhatsApped" : "emailed"} {ago(lastOut.at)}{typeof lastOut.by === "string" && lastOut.by && !lastOut.by.includes("@") ? ` (${lastOut.by})` : ""}</> : "We haven't messaged them yet"}
          {lastIn ? <> · client last wrote {ago(lastIn.at)}</> : ""}
          {waitingOnUs ? <strong> · waiting on us</strong> : ""}
        </p>
      )}
      {checkMsg && (
        <p className="mb-2 rounded-lg bg-navy-50 px-2.5 py-1.5 text-[11px] text-navy-500">
          {checkMsg}
        </p>
      )}

      <div ref={scrollRef} className="scroll-area -mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs text-navy-400">
            No activity yet. Emails you send are logged here, and you can add notes
            or log a client&apos;s reply below.
          </p>
        ) : (
          entries.map((e) => {
            const inbound = e.direction === "in";
            const Icon = inbound ? FiCornerDownLeft : ICONS[e.type] || FiMessageSquare;
            return (
              <div key={e.id} className="flex gap-2.5">
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    inbound
                      ? "bg-blue-100 text-blue-700"
                      : e.type === "email"
                      ? "bg-brand-100 text-brand-700"
                      : e.type === "payment"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-navy-100 text-navy-600"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div
                  className={`min-w-0 flex-1 rounded-lg px-3 py-2 ${
                    inbound ? "bg-blue-50" : "bg-navy-50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-navy-800">
                      {e.title}
                    </p>
                    <span className="shrink-0 text-[10px] text-navy-400">
                      {fmtDate(e.at)} · {fmtTime(e.at)}
                    </span>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-navy-600">
                      {inbound ? cleanReplyText(e.detail) : e.detail}
                    </p>
                  )}
                  {e.to && (
                    <p className="mt-0.5 text-[11px] text-navy-400">to {e.to}</p>
                  )}
                  {e.attachment && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600">
                      <FiPaperclip className="h-3 w-3" /> {e.attachment}
                    </p>
                  )}
                  {e.file && fileSrc(e.file) && (
                    <a
                      href={fileSrc(e.file)}
                      download={e.file.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      <FiDownload className="h-3 w-3" /> {e.file.name}
                    </a>
                  )}
                  {e.attachments?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {e.attachments.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                        >
                          <FiPaperclip className="h-2.5 w-2.5" />
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {e.by && (
                    <p className="mt-0.5 text-[10px] text-navy-400">— {e.by}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 border-t border-navy-100 pt-3">
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Log a note or the client's reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {file && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-navy-500">
            <FiPaperclip className="h-3 w-3" /> {file.name}
            <button
              className="ml-1 text-rose-500"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              remove
            </button>
          </p>
        )}
        {err && <p className="mt-1 text-[11px] text-rose-600">{err}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-800">
            <FiPaperclip /> Attach
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={pickFile}
            />
          </label>
          <button
            className="btn-primary py-1.5 text-xs"
            onClick={submit}
            disabled={!text.trim() && !file}
          >
            <FiPlus /> Log entry
          </button>
        </div>
      </div>
    </section>
  );
}
