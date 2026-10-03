"use client";

// Settings → Saved replies. The WhatsApp messages on every job's client
// panel, editable. Leave one blank to use the built-in wording.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { WA_REPLIES, REPLY_TAGS } from "@/lib/waReplies";

// Quote-stage messages: the price is never sent on WhatsApp (owner rule —
// it's in the emailed quote).
const NO_PRICE = new Set(["received", "quote", "availability", "followup", "corrected"]);
const hasPrice = (t) => /\{price\}|£\s?\d/.test(String(t || ""));

export default function ReplySettings() {
  const { rules, saveRules } = useStore();
  const [open, setOpen] = useState(null);
  const saved = rules.replyOverrides || {};
  const save = (key, text) => saveRules({ replyOverrides: { ...saved, [key]: text.trim() === WA_REPLIES.find((r) => r.key === key).text.trim() ? "" : text } });
  return (
    <section>
      <h2 className="mb-3 section-label text-sm">Saved replies</h2>
      <div className="card p-5">
        <p className="text-xs text-navy-500">The WhatsApp replies offered on each job. Words in {"{curly brackets}"} are filled in from the job: {REPLY_TAGS.map((t) => `{${t}}`).join(" ")}.</p>
        <ul className="mt-3 divide-y divide-navy-100">
          {WA_REPLIES.map((r) => (
            <li key={r.key} className="py-2.5">
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left text-sm" onClick={() => setOpen(open === r.key ? null : r.key)}>
                <span className="font-semibold text-navy-900">{r.label}</span>
                <span className="text-xs text-navy-500">
                  {NO_PRICE.has(r.key) && hasPrice(saved[r.key]) ? <strong className="text-rose-600">Contains a price · </strong> : null}
                  {saved[r.key] ? "Your wording" : "Built-in wording"} · {open === r.key ? "Close" : "Edit"}
                </span>
              </button>
              {open === r.key && (
                <div className="mt-2 space-y-2">
                  <textarea className="input resize-y text-sm" rows={6} defaultValue={saved[r.key] || r.text} key={saved[r.key] || r.key} onBlur={(e) => e.target.value !== (saved[r.key] || r.text) && save(r.key, e.target.value)} />
                  {NO_PRICE.has(r.key) && <p className={`text-xs ${hasPrice(saved[r.key]) ? "font-semibold text-rose-600" : "text-navy-500"}`}>Don&rsquo;t put the price in this message — the price is only in the emailed quote.</p>}
                  {saved[r.key] && <button type="button" className="text-xs font-semibold text-navy-500 underline" onClick={() => saveRules({ replyOverrides: { ...saved, [r.key]: "" } })}>Go back to the built-in wording</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
