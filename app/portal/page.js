"use client";

// /portal — the engineer's view. An engineer login is shown this by the app
// shell directly (components/AuthGate.js); this route exists so an office
// user whose email matches an engineer record can look at the same thing.
import EngineerPortal from "@/components/EngineerPortal";

export default function PortalPage() {
  return <EngineerPortal />;
}
