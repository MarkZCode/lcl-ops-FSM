"use client";

import { useEffect, useState } from "react";
import { FiLock, FiUser, FiEye, FiEyeOff, FiShield, FiCheck } from "react-icons/fi";
import { useAuth } from "@/lib/auth";

// Colours taken from the company logo itself (public/lcl-logo.png), so the
// sign-in screen matches the mark instead of approximating it.
const NAVY = "#021a3b";
const GREEN = "#0d860a";
const GREEN_ON_NAVY = "#4cc247"; // the logo green, lifted so it reads on navy

const BADGES = [
  "Gas Safe Registered",
  "NICEIC / NAPIT Certified",
  "Same-day Certificates",
  "All 32 London Boroughs",
];

// Is Google sign-in actually switched on in Supabase? The button used to be
// shown regardless and simply failed when pressed. Read from the public auth
// settings endpoint, so it appears by itself the moment it's enabled.
function useGoogleEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s) => setEnabled(!!s?.external?.google))
      .catch(() => {});
  }, []);
  return enabled;
}

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth();
  const googleEnabled = useGoogleEnabled();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Tells the next page load it follows a sign-in, so the loading screen
  // plays in full instead of flashing (see AuthGate).
  const markSignedIn = () => {
    try { sessionStorage.setItem("lcl-welcome", "1"); } catch {}
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    markSignedIn();
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
      markSignedIn();
      fetch("/api/auth/check-ip", { method: "POST" }).catch(() => {});
      window.location.href = "/";
    } else {
      setError(res.error);
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-[12px] border border-transparent bg-[#f5f5f7] py-3 pl-10 pr-4 text-[15px] text-[#1d1d1f] " +
    "placeholder:text-[#a1a1a6] outline-none transition focus:border-[#0d860a]/40 focus:bg-[#ffffff] focus:ring-4 focus:ring-[#0d860a]/10";

  return (
    <div
      className="legacy-chrome flex min-h-[var(--app-height,100dvh)] w-full flex-col lg:flex-row"
      // Inline, not bg-white: the app's dark-mode layer repaints .bg-white
      // dark, which turned this panel black under dark text. The sign-in
      // screen is always light.
      style={{ background: "#ffffff", colorScheme: "light" }}
    >
      {/* ── Brand panel ──
          order-2 on mobile: this panel's heading + description alone are
          tall enough to push the sign-in fields below the fold on a phone,
          reported as the login screen opening to marketing copy with the
          form needing a scroll to even reach. Desktop is unaffected
          (lg:order-1 restores brand-left, form-right). */}
      <div
        className="relative order-2 flex flex-col justify-between overflow-hidden px-7 pb-10 pt-8 lg:order-1 lg:w-[46%] lg:px-14 lg:py-14"
        style={{ background: NAVY }}
      >
        {/* One soft light source, not decoration */}
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: `radial-gradient(circle, ${GREEN_ON_NAVY}, transparent 65%)` }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-32 h-[28rem] w-[28rem] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "radial-gradient(circle, #6f8fcf, transparent 65%)" }}
        />

        <div className="relative z-10 flex items-center gap-3.5">
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] shadow-[0_6px_20px_rgba(0,0,0,0.25)]" style={{ background: "#ffffff" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lcl-logo.png" alt="Landlord Compliance London" className="h-10 w-10 object-contain" />
          </span>
          <div>
            <p className="text-[19px] font-semibold leading-none tracking-tight text-white">LCL Ops</p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em]" style={{ color: GREEN_ON_NAVY }}>
              Field Service
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-10 lg:mt-0">
          <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.22em] text-white/55">
            Landlord Compliance London
          </p>
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:text-[42px] lg:text-[48px]">
            Managing compliance,
            <br />
            <span style={{ color: GREEN_ON_NAVY }}>made simple.</span>
          </h1>
          <p className="mt-5 max-w-[26rem] text-[15px] leading-relaxed text-white/70">
            Jobs, dispatch, invoices and certificates — everything your team needs to run
            landlord safety compliance across London.
          </p>

          <div className="mt-9 hidden grid-cols-2 gap-2.5 sm:grid">
            {BADGES.map((b) => (
              <div
                key={b}
                className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-3.5 py-3"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: `${GREEN_ON_NAVY}26` }}>
                  <FiCheck className="h-3 w-3" style={{ color: GREEN_ON_NAVY }} />
                </span>
                <span className="text-[13px] font-medium text-white/85">{b}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 mt-10 hidden text-[12px] text-white/40 lg:block">
          © {new Date().getFullYear()} Landlord Compliance London Ltd
        </p>
      </div>

      {/* ── Sign-in ── order-1 on mobile so this is what actually opens. */}
      <div className="order-1 flex flex-1 items-center justify-center px-6 py-12 lg:order-2 lg:px-16">
        <div className="w-full max-w-[380px]">
          <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">Welcome back</h2>
          <p className="mt-1.5 text-[15px] text-[#6e6e73]">Sign in to your LCL Ops account</p>

          {googleEnabled && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy || googleBusy}
                style={{ background: "#ffffff" }}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-[#d2d2d7] py-3 text-[15px] font-medium text-[#1d1d1f] transition hover:bg-[#f5f5f7] disabled:opacity-60"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
              </button>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-[#e8e8ed]" />
                <span className="text-[13px] text-[#86868b]">or</span>
                <span className="h-px flex-1 bg-[#e8e8ed]" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={`space-y-4 ${googleEnabled ? "" : "mt-8"}`}>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#1d1d1f]">Username or email</label>
              <div className="relative">
                <FiUser className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  className={field}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Username or you@example.com"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#1d1d1f]">Password</label>
              <div className="relative">
                <FiLock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${field} pr-11`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#86868b] transition hover:bg-[#e8e8ed]"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-[12px] bg-[#fff1f0] px-3.5 py-2.5 text-[14px] text-[#c9302c]">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="!mt-6 w-full rounded-full py-3.5 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(13,134,10,0.28)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-7 flex items-center justify-center gap-1.5 text-[12px] text-[#86868b]">
            <FiShield className="h-3.5 w-3.5" style={{ color: GREEN }} />
            Secure · accounts are managed by your administrator
          </p>
        </div>
      </div>
    </div>
  );
}
