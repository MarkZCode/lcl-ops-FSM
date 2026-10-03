"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ErrorBoundary from "./ErrorBoundary";
// The splash is small and shows first, so it stays in the main bundle.
import SplashScreen, { INTRO_MS } from "./SplashScreen";

// Loaded only when needed — the public client and engineer links render
// bare and never download the office app (it was ~350 KB on every link).
const OfficeShell = dynamic(() => import("./OfficeShell"), { ssr: false });
const EngineerShell = dynamic(() => import("./EngineerShell"), { ssr: false });
const NoAccess = dynamic(() => import("./EngineerShell").then((m) => m.NoAccess), { ssr: false });
const LoginScreen = dynamic(() => import("./LoginScreen"), { ssr: false });

// Wraps the whole app. Shows the login screen until a user signs in. The data
// store is mounted ONLY when signed in (inside OfficeShell), so its Supabase
// queries always carry a valid session.
export default function AuthGate({ children }) {
  const { user, ready } = useAuth();
  const [showTour, setShowTour] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Straight after signing in, play the loading screen through (INTRO_MS)
  // instead of letting it flash for a frame — the login check is so fast
  // that's all it ever got. Only after a sign-in: an ordinary reload still
  // shows the app as soon as it's ready.
  const [holdSplash, setHoldSplash] = useState(false);
  useEffect(() => {
    let welcome = false;
    try { welcome = sessionStorage.getItem("lcl-welcome") === "1"; } catch {}
    if (!welcome) return;
    setHoldSplash(true);
    const t = setTimeout(() => {
      setHoldSplash(false);
      try { sessionStorage.removeItem("lcl-welcome"); } catch {}
    }, INTRO_MS);
    return () => clearTimeout(t);
  }, []);

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
      pathname.startsWith("/confirm/") ||
      pathname === "/help";
    if (!allowed) router.replace("/portal");
  }, [user, pathname, router]);

  // Pages meant for people WITHOUT a login — a client's quote/status link,
  // an engineer's confirm link, an unsubscribe link. They sat behind the
  // login screen like everything else, so a client opening their link saw a
  // staff sign-in form. They render bare: no shell, no store, no session.
  if (/^\/(share|confirm|certs)\//.test(pathname || "") || pathname === "/unsubscribe") {
    return <ErrorBoundary><Suspense fallback={null}>{children}</Suspense></ErrorBoundary>;
  }

  if (!ready || (holdSplash && user)) {
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

  // Signed in, but nobody has given this account a role — e.g. someone who
  // used "Continue with Google" with an address that isn't a staff account.
  // They see nothing of the business until an admin sets them up.
  if (!user.role) {
    return (
      <ErrorBoundary>
        <NoAccess email={user.email} />
      </ErrorBoundary>
    );
  }

  // An engineer login gets the portal and nothing else. The office store
  // (every job, client and engineer) is never mounted for them, so none of
  // it is requested — the database refuses it to them as well.
  if (user.role === "engineer") {
    return (
      <ErrorBoundary>
        <EngineerShell />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <OfficeShell showTour={showTour} setShowTour={setShowTour}>{children}</OfficeShell>
    </ErrorBoundary>
  );
}
