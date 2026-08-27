"use client";

import { useState } from "react";
import { FiLock, FiUser, FiEye, FiEyeOff, FiShield, FiCheckCircle } from "react-icons/fi";
import { useAuth } from "@/lib/auth";
import LogoMark from "./LogoMark";

const BADGES = [
  "Gas Safe Registered",
  "NICEIC / NAPIT Certified",
  "Same-day Certificates",
  "All 32 London Boroughs",
];

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    const res = await loginWithGoogle();
    if (!res.ok) {
      setError(res.error || "Google sign-in failed.");
      setGoogleBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await login(identifier, password);
    if (res.ok) {
      try { sessionStorage.setItem("lcl-welcome", "1"); } catch {}
      fetch("/api/auth/check-ip", { method: "POST" }).catch(() => {});
      window.location.href = "/";
    } else {
      setError(res.error);
      setBusy(false);
    }
  };

  return (
    // `legacy-chrome` opts this screen out of the console design system's
    // global normalisations (flattened shadows, calmed uppercase labels,
    // capped font weights). The owner considers the login screen finished
    // as-is, so it keeps its own gradients, depth and lettering.
    <div className="legacy-chrome flex min-h-screen w-full flex-col lg:flex-row">

      {/* ── LEFT BRAND PANEL ── */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-navy-900 px-8 py-10 lg:w-[48%] lg:px-14 lg:py-14">
        {/* Background texture — subtle dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl" />

        {/* Logo + company name */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-lg dark:!bg-white">
            <LogoMark className="h-8 w-8" variant="light" />
          </span>
          <div>
            <p className="text-lg font-bold leading-none text-white">LCL Ops</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
              Field Service
            </p>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 my-10 lg:my-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
            Landlord Compliance London
          </p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-[2.6rem]">
            Managing compliance,<br />
            <span className="text-brand-400">made simple.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-300">
            Jobs, dispatch, invoices and certificates — everything your team needs to run efficient landlord safety compliance across London.
          </p>

          {/* Credential badges */}
          <div className="mt-8 grid grid-cols-2 gap-2.5">
            {BADGES.map((b) => (
              <div key={b} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5">
                <FiCheckCircle className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                <span className="text-xs font-medium text-navy-200">{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[11px] text-navy-500">
          © {new Date().getFullYear()} Landlord Compliance London Ltd · Reg 15900987
        </p>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 lg:px-16">
        <div className="w-full max-w-[360px]">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-navy-900">Welcome back</h2>
            <p className="mt-1 text-sm text-navy-500">Sign in to your LCL Ops account</p>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy || googleBusy}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm font-semibold text-navy-700 shadow-sm transition hover:bg-navy-50 hover:border-navy-300 disabled:opacity-60"
          >
            {googleBusy ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-navy-100" />
            <span className="text-xs font-medium text-navy-400">or sign in with password</span>
            <span className="h-px flex-1 bg-navy-100" />
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Username or email</label>
              <div className="relative">
                <FiUser className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="input pl-9"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="mark  or  you@example.com"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <FiLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input
                  type={show ? "text" : "password"}
                  className="input pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-navy-400 hover:bg-navy-100"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-navy-400">
            <FiShield className="text-brand-500" />
            Secure · accounts managed by your administrator
          </p>
        </div>
      </div>

    </div>
  );
}
