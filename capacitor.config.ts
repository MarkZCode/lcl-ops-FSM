import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.landlordcompliancelondon.lclops',
  appName: 'LCL Ops',
  // webDir is required by Capacitor even though it's unused here — the app
  // always loads the live, already-deployed site below instead of bundled
  // local files. That's the whole point: this wrapper adds a real native
  // shell (app icon, native status bar, TestFlight/App Store install)
  // around the EXISTING Next.js app with zero changes to its code or to
  // the Supabase data behind it. Every fix already shipped to
  // lcl-ops.vercel.app is live here automatically, the same day, with no
  // separate app-store release needed for ordinary bug fixes.
  webDir: 'public',
  server: {
    url: 'https://lcl-ops.vercel.app',
    // The real production URL is already HTTPS, so cleartext (plain HTTP)
    // traffic is never allowed.
    cleartext: false,
  },
  ios: {
    // Matches the web app's own always-dark console design (see
    // app/globals.css) instead of Capacitor's default light chrome, so the
    // native status bar/background doesn't flash white during launch.
    backgroundColor: '#0a0a0a',
    // The web app already computes and applies its own safe-area padding
    // via CSS env(safe-area-inset-*) (see components/BottomNav.js /
    // AuthGate.js) — letting Capacitor's WKWebView draw edge-to-edge and
    // leaving those values to the page itself, rather than double-applying
    // a native inset on top of the page's own, is what avoids yet another
    // version of the exact safe-area bugs already fought through on the
    // PWA. contentInset: "never" is the WKWebView setting for that.
    contentInset: 'never',
  },
};

export default config;
