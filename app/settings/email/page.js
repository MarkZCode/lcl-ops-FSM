"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FiArrowLeft,
  FiMail,
  FiKey,
  FiEye,
  FiEyeOff,
  FiSend,
  FiRefreshCw,
  FiCheckCircle,
  FiInfo,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import {
  EMAIL_PROVIDERS,
  TEMPLATE_VARS,
  defaultTemplates,
} from "@/lib/settings";
import { renderTemplate, sampleContext } from "@/lib/email";
import PageHeader from "@/components/PageHeader";

export default function EmailSettingsPage() {
  const { email, templates, updateEmail, updateTemplate, resetTemplates, hydrated } =
    useStore();
  const [showKey, setShowKey] = useState(false);
  const [activeTpl, setActiveTpl] = useState("quote");
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState(null);

  const isSmtp = email.provider === "smtp";
  const tpl = templates[activeTpl];
  const ctx = sampleContext(email);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const set = (key) => (e) => {
    updateEmail({ [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    flashSaved();
  };

  const handleTest = () => {
    // Prototype: no real send (needs server + provider key in Phase 2).
    if (!testTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      setTestResult({ ok: false, msg: "Enter a valid email address first." });
      return;
    }
    if (!email.apiKey && !isSmtp) {
      setTestResult({
        ok: false,
        msg: "Add your provider API key first. Real sending is enabled in Phase 2.",
      });
      return;
    }
    setTestResult({
      ok: true,
      msg: `Saved. In Phase 2 this will send a live test to ${testTo}. (No email sent in prototype mode.)`,
    });
  };

  return (
    <>
      <div className="border-b border-navy-100 bg-white px-5 py-4 sm:px-8">
        <Link
          href="/settings"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800"
        >
          <FiArrowLeft /> Back to settings
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-800 text-white">
              <FiMail />
            </span>
            <div>
              <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">
                Email configuration
              </h1>
              <p className="text-sm text-navy-500">
                Provider, sender identity and message templates
              </p>
            </div>
          </div>
          {saved && (
            <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 animate-fade-in">
              <FiCheckCircle /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-8">
        {/* Phase note */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <FiInfo className="mt-0.5 shrink-0" />
          <p>
            Your settings save instantly. Live sending connects in <strong>Phase 2</strong>,
            once a provider key is added and the secure server route is enabled — your
            API key will then be stored server-side, never in the browser.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Provider + sender */}
          <section className="space-y-4">
            <div className="card p-5">
              <h2 className="mb-4 section-label text-sm">
                Email provider
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Provider</label>
                  <select
                    className="input"
                    value={email.provider}
                    onChange={set("provider")}
                  >
                    {EMAIL_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-navy-400">
                    {EMAIL_PROVIDERS.find((p) => p.value === email.provider)?.hint}
                  </p>
                </div>

                {!isSmtp ? (
                  <div>
                    <label className="label">API key</label>
                    <div className="relative">
                      <FiKey className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                      <input
                        type={showKey ? "text" : "password"}
                        className="input pl-9 pr-10"
                        placeholder="re_xxxxxxxxxxxxxxxx"
                        value={email.apiKey}
                        onChange={set("apiKey")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-navy-400 hover:bg-navy-100"
                        aria-label={showKey ? "Hide key" : "Show key"}
                      >
                        {showKey ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">SMTP host</label>
                      <input className="input" placeholder="smtp.gmail.com" value={email.smtpHost} onChange={set("smtpHost")} />
                    </div>
                    <div>
                      <label className="label">Port</label>
                      <input className="input" placeholder="587" value={email.smtpPort} onChange={set("smtpPort")} />
                    </div>
                    <div>
                      <label className="label">Username</label>
                      <input className="input" placeholder="you@example.com" value={email.smtpUser} onChange={set("smtpUser")} />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <input type="password" className="input" placeholder="••••••••" value={email.smtpPass} onChange={set("smtpPass")} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 section-label text-sm">
                Sender identity
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">From name</label>
                    <input className="input" value={email.fromName} onChange={set("fromName")} />
                  </div>
                  <div>
                    <label className="label">From email</label>
                    <input className="input" value={email.fromEmail} onChange={set("fromEmail")} />
                  </div>
                </div>
                <div>
                  <label className="label">Reply-to</label>
                  <input className="input" value={email.replyTo} onChange={set("replyTo")} />
                </div>
                <div>
                  <label className="label">Signature</label>
                  <textarea
                    className="input resize-none"
                    rows={4}
                    value={email.signature}
                    onChange={set("signature")}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input
                    type="checkbox"
                    checked={email.bccSelf}
                    onChange={set("bccSelf")}
                    className="h-4 w-4 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
                  />
                  BCC a copy of every email to {email.fromEmail || "yourself"}
                </label>
              </div>
            </div>

            {/* Test send */}
            <div className="card p-5">
              <h2 className="mb-3 section-label text-sm">
                Send a test email
              </h2>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <button className="btn-navy shrink-0" onClick={handleTest}>
                  <FiSend /> Send test
                </button>
              </div>
              {testResult && (
                <p
                  className={`mt-2 text-xs ${
                    testResult.ok ? "text-brand-700" : "text-rose-600"
                  }`}
                >
                  {testResult.msg}
                </p>
              )}
            </div>
          </section>

          {/* Templates */}
          <section className="space-y-4">
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-label text-sm">
                  Message templates
                </h2>
                <button
                  className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-navy-800"
                  onClick={resetTemplates}
                >
                  <FiRefreshCw /> Reset to defaults
                </button>
              </div>

              {/* Template tabs */}
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.keys(defaultTemplates).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveTpl(key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      activeTpl === key
                        ? "border-navy-800 bg-navy-800 text-white"
                        : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                    }`}
                  >
                    {templates[key]?.name || key}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Subject</label>
                  <input
                    className="input"
                    value={tpl.subject}
                    onChange={(e) => {
                      updateTemplate(activeTpl, { subject: e.target.value });
                      flashSaved();
                    }}
                  />
                </div>
                <div>
                  <label className="label">Body</label>
                  <textarea
                    className="input resize-none font-mono text-xs leading-relaxed"
                    rows={11}
                    value={tpl.body}
                    onChange={(e) => {
                      updateTemplate(activeTpl, { body: e.target.value });
                      flashSaved();
                    }}
                  />
                </div>
              </div>

              {/* Variable chips */}
              <div className="mt-4">
                <p className="label">Insert variables</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARS.map((v) => (
                    <button
                      key={v.token}
                      title={v.desc}
                      onClick={() => {
                        updateTemplate(activeTpl, {
                          body: tpl.body + " " + v.token,
                        });
                        flashSaved();
                      }}
                      className="rounded-md bg-navy-50 px-2 py-1 font-mono text-[11px] text-navy-600 hover:bg-navy-100"
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="card overflow-hidden">
              <div className="border-b border-navy-100 bg-navy-50 px-5 py-2.5">
                <p className="section-label text-xs">
                  Preview (with sample data)
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-navy-400">Subject</p>
                <p className="font-semibold text-navy-900">
                  {renderTemplate(tpl.subject, ctx)}
                </p>
                <hr className="my-3 border-navy-100" />
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy-700">
                  {renderTemplate(tpl.body, ctx)}
                </p>
                {email.signature && (
                  <p className="mt-4 whitespace-pre-wrap border-t border-navy-100 pt-3 text-xs text-navy-500">
                    {email.signature}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
