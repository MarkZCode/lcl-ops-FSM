"use client";

// Screens for logins that aren't office staff: an engineer (their portal and
// nothing else) and an account with no role yet. Loaded on demand by AuthGate.
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import Toaster from "./Toaster";
import EngineerPortal from "./EngineerPortal";

export function NoAccess({ email }) {
  const { logout } = useAuth();
  return (
    <div className="grid min-h-[var(--app-height,100dvh)] place-items-center bg-[#f5f5f7] px-6">
      <div style={{ background: "#ffffff", colorScheme: "light" }} className="w-full max-w-sm rounded-[22px] p-8 text-center shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lcl-logo.png" alt="Landlord Compliance London" className="mx-auto h-16 w-16 object-contain" />
        <h1 className="mt-5 text-[19px] font-semibold tracking-tight text-[#1d1d1f]">Account not set up yet</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6e6e73]">
          You&apos;re signed in as <strong className="text-[#1d1d1f]">{email}</strong>, but this account
          hasn&apos;t been given access to LCL Ops. Ask your administrator to set it up.
        </p>
        <button onClick={logout} className="mt-6 w-full rounded-full bg-[#1d1d1f] py-3 text-[15px] font-medium text-white">
          Sign out
        </button>
      </div>
    </div>
  );
}

// The whole app, for an engineer: a slim top bar and their portal.
export default function EngineerShell() {
  const { logout } = useAuth();
  // Clear anything an earlier version of the app cached on this device.
  useEffect(() => { try { indexedDB.deleteDatabase("lcl-ops-cache"); } catch {} }, []);
  return (
    <div className="min-h-[var(--app-height,100dvh)] w-full">
      <div className="flex items-center justify-between border-b border-navy-100 px-4 pb-3 dark:border-white/10" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", backgroundColor: "var(--surface-card)" }}>
        <span className="text-[17px] font-semibold tracking-tight text-navy-900">Landlord Compliance London</span>
        <button type="button" onClick={logout} className="btn-outline py-1.5 text-xs">Sign out</button>
      </div>
      <EngineerPortal />
      <Toaster />
    </div>
  );
}

