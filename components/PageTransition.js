"use client";

// A short slide-and-fade whenever the page changes, so moving round the app
// reads as movement rather than a hard cut.
//
// The direction means something:
//   • to a section further along the menu  → the page comes in from the right
//   • to one earlier in the menu           → from the left
//   • into a record (Jobs → a job)         → up from below
//   • back out of one (a job → Jobs)       → down from above
// Opening the app, or reloading, just fades in.
//
// It is one CSS animation on a wrapper — no library, nothing measured, and
// it is switched off entirely for anyone whose device asks for reduced
// motion. The animation ends with no transform left on the wrapper, so
// pop-ups and sticky bars inside the page behave exactly as before.
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { navLinks, utilityLinks } from "@/lib/nav";

const ORDER = [...navLinks, ...(utilityLinks || [])].map((l) => l.href);
const section = (p) => "/" + (String(p || "/").split("/")[1] || "");
const depth = (p) => String(p || "/").split("/").filter(Boolean).length;
const rank = (p) => {
  const i = ORDER.indexOf(section(p));
  return i === -1 ? ORDER.length : i;
};

function direction(from, to) {
  if (!from) return "fade";
  if (section(from) === section(to)) {
    if (depth(to) > depth(from)) return "up";
    if (depth(to) < depth(from)) return "down";
    return "fade";
  }
  return rank(to) >= rank(from) ? "left" : "right";
}

export default function PageTransition({ children }) {
  const pathname = usePathname();
  const prev = useRef(null);
  const dir = useRef("fade");
  if (prev.current !== pathname) {
    dir.current = direction(prev.current, pathname);
    prev.current = pathname;
  }
  return (
    <div key={pathname} className={`page-in page-in-${dir.current}`}>
      {children}
    </div>
  );
}
