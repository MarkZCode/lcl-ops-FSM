"use client";

import { useMemo, useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const markSignedIn = () => {
    try {
      sessionStorage.setItem("lcl-welcome", "1");
    } catch {}
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
      setError(res.error || "Invalid username or password.");
      setBusy(false);
    }
  };

  // Generate glowing undulating wave ribbon lines in green
  const wavePaths = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const t = i / 31;
      const offset = (i - 16) * 7.5;
      const spread = Math.sin(t * Math.PI) * 14;
      const y1 = 640 + offset;
      const cx1 = 360 + offset * 1.5;
      const cy1 = 680 + offset * 1.2 + spread;
      const cx2 = 680 + offset * 1.2;
      const cy2 = 490 + offset * 0.9;
      const mx = 880 + offset * 0.8;
      const my = 390 + offset * 0.7;
      const cx3 = 1080 + offset * 0.5;
      const cy3 = 280 + offset * 0.5 - spread;
      const cx4 = 1260;
      const cy4 = 130 + offset * 0.4;
      const endX = 1520;
      const endY = 80 + offset * 0.3;
      const opacity = 0.14 + (1 - Math.abs(i - 16) / 16) * 0.68;
      return {
        d: `M -60 ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${mx} ${my} C ${cx3} ${cy3}, ${cx4} ${cy4}, ${endX} ${endY}`,
        opacity,
      };
    });
  }, []);

  return (
    <div
      className="relative flex min-h-[var(--app-height,100dvh)] w-full items-center justify-center overflow-hidden bg-black px-4 py-8 select-none"
      style={{ colorScheme: "dark" }}
    >
      {/* ── Background: Green Ambient Glows ── */}
      <div className="pointer-events-none absolute -left-24 bottom-4 h-[520px] w-[520px] rounded-full bg-emerald-600/18 blur-[130px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-emerald-500/22 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-6 h-[460px] w-[460px] rounded-full bg-emerald-400/12 blur-[120px]" />

      {/* ── Background: Glowing Green Wave Ribbon ── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-85"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="greenWave" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.25" />
            <stop offset="25%" stopColor="#059669" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#10b981" stopOpacity="1" />
            <stop offset="85%" stopColor="#34d399" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {wavePaths.map((p, idx) => (
          <path
            key={idx}
            d={p.d}
            fill="none"
            stroke="url(#greenWave)"
            strokeWidth="1.25"
            strokeOpacity={p.opacity}
          />
        ))}
      </svg>

      {/* ── Glassmorphic Login Card ── */}
      <div className="relative z-10 w-full max-w-[280px] sm:max-w-[290px] rounded-[24px] border border-white/[0.08] bg-[#161817]/75 px-6 py-6 sm:px-7 sm:py-7 shadow-[0_24px_56px_rgba(0,0,0,0.85),0_0_40px_rgba(16,185,129,0.06)] backdrop-blur-2xl">
        <h1 className="text-center text-[19px] font-semibold tracking-tight text-white mb-5">
          Login
        </h1>

        <form onSubmit={submit} className="space-y-2.5">
          <div>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username"
              autoFocus
              className="w-full rounded-full border border-white/[0.08] bg-[#2a2c2b]/70 py-2 px-4 text-[13px] text-white placeholder:text-white/40 outline-none transition duration-150 focus:border-emerald-500/60 focus:bg-[#323634] focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <div className="relative">
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-full border border-white/[0.08] bg-[#2a2c2b]/70 py-2 pl-4 pr-9 text-[13px] text-white placeholder:text-white/40 outline-none transition duration-150 focus:border-emerald-500/60 focus:bg-[#323634] focus:ring-2 focus:ring-emerald-500/15"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-white/40 transition hover:text-white"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <FiEyeOff className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-center text-[11.5px] text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#4a4d4b]/85 hover:bg-emerald-600 px-7 py-1.5 text-[13px] font-medium text-white shadow-lg border border-white/10 transition duration-200 active:scale-95 disabled:opacity-50 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              {busy ? "Logging in…" : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
