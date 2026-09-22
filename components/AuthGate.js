"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import LoginScreen from "./LoginScreen";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import VersionWatcher from "./VersionWatcher";
import Toaster from "./Toaster";
import SyncErrorBanner from "./SyncErrorBanner";
import ErrorBoundary from "./ErrorBoundary";
import { ConfirmProvider } from "./ConfirmProvider";
import OnboardingTour from "./OnboardingTour";
import SplashScreen from "./SplashScreen";

// Wraps the whole app. Shows the login screen until a user signs in. The data
// store is mounted ONLY when signed in, so its Supabase queries always carry a
// valid session (the database is locked to authenticated requests).
export default function AuthGate({ children }) {
  const { user, ready } = useAuth();
  const [showTour, setShowTour] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Check if Help page requested a tour (persists across navigation)
  useEffect(() => {
    try {
      if (sessionStorage.getItem("lcl-start-tour") === "1") {
        sessionStorage.removeItem("lcl-start-tour");
        // Small delay so Dashboard renders first
        setTimeout(() => setShowTour(true), 600);
      }
    } catch {}
  }, []);

  // Engineer (Portal-only) accounts are confined to /portal, individual job
  // pages, and Help — keep them off Dispatch/Reports/Settings/etc even if
  // they navigate there directly.
  useEffect(() => {
    if (user?.role !== "engineer") return;
    const allowed =
      pathname === "/portal" ||
      pathname.startsWith("/jobs/") ||
      pathname === "/help";
    if (!allowed) router.replace("/portal");
  }, [user, pathname, router]);

  if (!ready) {
    return (
      <ErrorBoundary>
        <SplashScreen />
      </ErrorBoundary>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <LoginScreen />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <StoreProvider>
        <ConfirmProvider>
        {/* Shell: one full-width app bar across the top, then rail + content
            beneath it. Previously the bar lived INSIDE the content column,
            so it started to the right of the sidebar and the app had no
            single clean top edge — which is the main structural difference
            from the reference layout. */}
        <div className="flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden lg:h-screen">
          <SyncErrorBanner />
          <TopBar />
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden lg:flex-row">
            <Sidebar />
            {/* Mobile bottom padding = tab-bar height (4rem) + notch safe-area,
                so the footer is never hidden behind the bottom nav. */}
            <div className="scroll-area min-w-0 flex-1 overflow-x-hidden overscroll-none pb-[calc(4rem+env(safe-area-inset-bottom))] lg:h-full lg:overflow-y-auto lg:pb-0" style={{touchAction:"pan-y"}}>
            <div className="flex min-h-full flex-col">
              <main className="flex-1 min-w-0">{children}</main>
              <footer className="bar-navy border-t border-white/[0.06] px-5 py-3 sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      LCL Ops
                    </p>
                    <span className="text-slate-700">·</span>
                    <p className="text-[10px] text-slate-500">Landlord Compliance London</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>Gas Safe Registered</span>
                    <span className="text-slate-700">·</span>
                    <span>NICEIC / NAPIT</span>
                    <span className="text-slate-700">·</span>
                    <span>© {new Date().getFullYear()}</span>
                    <span className="text-slate-700">·</span>
                    {/* Manually bumped every deploy (matches public/sw.js's
                        CACHE_VERSION convention). Exists purely so a device
                        stuck on old code can be diagnosed by just reading
                        this string out loud — no dev tools needed. */}
                    <span className="font-mono text-amber-400" title="Build version — read this to support if data looks wrong">build v88</span>
                    <span className="text-slate-700">·</span>
                    {/* Which host this window is actually running against, and
                        whether it has database credentials at all. An installed
                        PWA gives no address bar, so a stale install pointed at
                        an old preview URL is otherwise invisible — which is
                        exactly how weeks of demo data went unexplained. */}
                    <span
                      className={`font-mono ${supabaseConfigured ? "text-slate-500" : "text-rose-400"}`}
                      title={supabaseConfigured
                        ? "Connected to the live database"
                        : "NO database credentials in this build — nothing shown is real data"}
                    >
                      {typeof window !== "undefined" ? window.location.host : "—"}
                      {supabaseConfigured ? "" : " · NO DB"}
                    </span>
                  </div>
                </div>
              </footer>
            </div>
            </div>
          </div>
        </div>
        <BottomNav />
        <VersionWatcher />
        {/* WelcomeToast disabled for now — was popping up notifications on
            every app open. <WelcomeToast /> */}
        <Toaster />
        {showTour && <OnboardingTour forceShow onDone={() => setShowTour(false)} />}
      </ConfirmProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
