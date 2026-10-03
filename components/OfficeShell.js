"use client";

// The office app's frame — top bar, rail, bottom tabs, the data store — for a
// signed-in member of staff. Its own file so the client and engineer links
// (which never show it) don't download it: AuthGate loads it on demand.
import { StoreProvider } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import ViewportProbe from "./ViewportProbe";
import VersionWatcher from "./VersionWatcher";
import PageTransition from "./PageTransition";
import Toaster from "./Toaster";
import SyncErrorBanner from "./SyncErrorBanner";
import ErrorBoundary from "./ErrorBoundary";
import { ConfirmProvider } from "./ConfirmProvider";
import OnboardingTour from "./OnboardingTour";

export default function OfficeShell({ children, showTour, setShowTour }) {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <ConfirmProvider>
        {/* Shell: one full-width app bar across the top, then rail + content
            beneath it. Previously the bar lived INSIDE the content column,
            so it started to the right of the sidebar and the app had no
            single clean top edge — which is the main structural difference
            from the reference layout. */}
        {/* --app-height (set in ViewportHeightFix.js from window.innerHeight,
            in real pixels) instead of a vh/dvh unit. 100vh measures off the
            LARGEST possible mobile Safari viewport (address bar hidden) —
            taller than what's really on screen — and switching to 100dvh
            didn't close the gap either: this app runs installed to the home
            screen (standalone display), where dvh support has its own
            history of WebKit bugs not tracking the true visual viewport.
            Either way the symptom was the same: the shell measured itself
            against the wrong number and left a dead strip of real screen
            below everything it painted, including the fixed bottom nav
            ("still not going to the bottom... leaving like 20% of the
            screen untouched"). window.innerHeight has no such ambiguity. */}
        <div className="flex min-h-[var(--app-height,100dvh)] w-full max-w-[100vw] flex-col overflow-x-hidden lg:h-[var(--app-height,100dvh)]">
          <SyncErrorBanner />
          <TopBar />
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden lg:flex-row">
            <Sidebar />
            {/* Mobile bottom padding = tab-bar height (4rem) + notch safe-area,
                so the footer is never hidden behind the bottom nav. Restored
                to the original value (this was briefly changed to a plain
                pb-16 on a theory that the safe area was being reserved
                twice — it wasn't; the bottom nav's own padding is what
                actually needed restoring, see BottomNav.js). */}
            <div className="scroll-area min-w-0 flex-1 overflow-x-hidden overscroll-none pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:h-full lg:overflow-y-auto lg:pb-0" style={{touchAction:"pan-y"}}>
            <div className="flex min-h-full flex-col">
              <main className="flex-1 min-w-0"><PageTransition>{children}</PageTransition></main>
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
                    <span className="hidden sm:inline">Gas Safe Registered</span>
                    <span className="hidden text-slate-700 sm:inline">·</span>
                    <span className="hidden sm:inline">NICEIC / NAPIT</span>
                    <span className="hidden text-slate-700 sm:inline">·</span>
                    <span className="hidden sm:inline">© {new Date().getFullYear()}</span>
                    <span className="hidden text-slate-700 sm:inline">·</span>
                    {/* Manually bumped every deploy (matches public/sw.js's
                        CACHE_VERSION convention). Exists purely so a device
                        stuck on old code can be diagnosed by just reading
                        this string out loud — no dev tools needed. */}
                    <span className="font-mono text-amber-400" title="Build version — read this to support if data looks wrong">build v162</span>
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
        <ViewportProbe />
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
