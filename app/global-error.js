"use client";

import { useEffect, useState } from "react";
import {
  isChunkLoadError,
  tryChunkReload,
  nukeCacheAndReload,
} from "@/lib/chunkRecovery";

// The last line of defence.
//
// components/ErrorBoundary.js only protects the tree below it, which starts
// inside AuthGate. An error thrown ABOVE that — in the root layout, in the
// auth provider, or while the very first chunks are being imported — escapes
// it entirely, and Next.js replaces the whole page with its own bare
// "Application error: a client-side exception has occurred". That is a dead
// end: no styling, no explanation, and nothing to click. It is also exactly
// what a session left open across a deployment hits when the chunk filenames
// it started with stop resolving.
//
// global-error.js is the only thing Next.js will render in that situation. It
// replaces the root layout, so it has to supply its own <html> and <body>, and
// it cannot rely on anything from the normal tree (providers, store, theme).
export default function GlobalError({ error, reset }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("[GlobalError]", error?.message || error);
    // Stale build: reload once and it fixes itself. tryChunkReload keeps the
    // same counter the in-app boundary uses, so a genuinely broken build can't
    // put the browser in a reload loop — after the limit it falls through to
    // the UI below.
    if (isChunkLoadError(error) && tryChunkReload()) setReloading(true);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0a0a",
          color: "#f6f6f7",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55, margin: 0 }}>
            LCL Ops
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 8px" }}>
            {reloading ? "Updating to the latest version…" : "This page didn't load"}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.7, margin: "0 0 20px" }}>
            {reloading
              ? "One moment — fetching the current version of the app."
              : "Your data is safe on the server. This is the app code on this device, not your jobs or invoices."}
          </p>

          {!reloading && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => reset?.()}
                style={{
                  border: "1px solid rgba(255,255,255,0.18)", background: "transparent",
                  color: "#f6f6f7", borderRadius: 10, padding: "10px 16px",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => { setReloading(true); nukeCacheAndReload(); }}
                style={{
                  border: "none", background: "#3fa34d", color: "#fff",
                  borderRadius: 10, padding: "10px 16px",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Clear cache &amp; reload
              </button>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
