"use client";

// Contextual section-by-section onboarding. Shows automatically the FIRST time
// a new user visits each section. Each section defines its own 2–4 steps that
// highlight real elements on that page. Nothing shows for returning users.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FiArrowRight, FiArrowLeft, FiX } from "react-icons/fi";

// Tour key is per-user so a new user always gets the tour, returning users never do.
function getTourKey() {
  try {
    // Try to get user ID from Supabase session stored in localStorage
    const keys = Object.keys(localStorage).find(k => k.includes("supabase") && k.includes("auth"));
    if (keys) {
      const raw = JSON.parse(localStorage.getItem(keys) || "{}");
      const uid = raw?.user?.id;
      if (uid) return `lcl-toured-v1-${uid}`;
    }
  } catch {}
  return "lcl-toured-v1"; // fallback
}
function getTouredSections() {
  try { return JSON.parse(localStorage.getItem(getTourKey()) || "[]"); } catch { return []; }
}
function markToured(key) {
  try {
    const existing = getTouredSections();
    if (!existing.includes(key)) localStorage.setItem(getTourKey(), JSON.stringify([...existing, key]));
  } catch {}
}

function isNavSelector(selector) {
  return selector && (selector.includes("data-tour-nav") || selector.includes('[href="'));
}

function openMobileNavIfNeeded(selector) {
  if (typeof window === "undefined" || window.innerWidth >= 1024) return false;
  if (!isNavSelector(selector)) return false;
  window.dispatchEvent(new Event("lcl-open-mobile-nav"));
  return true;
}

// Tries to get the bounding rect of a CSS selector. Returns null if not found.
function getRect(selector) {
  if (!selector) return null;
  try {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      return rect;
    }
    const el = document.querySelector(selector);
    return el ? el.getBoundingClientRect() : null;
  } catch { return null; }
}

const PAD = 10;

export function SectionTour({ sectionKey, steps }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const toured = getTouredSections();
      if (!toured.includes(sectionKey)) setActive(true);
    }, 800);
    return () => clearTimeout(t);
  }, [sectionKey]);

  const dismiss = useCallback(() => {
    setActive(false);
    markToured(sectionKey);
  }, [sectionKey]);

  if (!active) return null;
  return <TourOverlay steps={steps} onDone={dismiss} />;
}

// Convenience hook — returns a <SectionTour> element ready to render
export function useSectionTour(sectionKey, steps) {
  return <SectionTour sectionKey={sectionKey} steps={steps} />;
}

function TourOverlay({ steps, onDone }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Track the highlighted element rect. Use a one-shot read + resize observer
  // instead of a constant RAF loop so we don't burn CPU while the tour is open.
  useEffect(() => {
    const current = steps[step];
    const update = () => setRect(getRect(current?.selector));
    const needsNav = openMobileNavIfNeeded(current?.selector);
    const t = setTimeout(update, needsNav ? 350 : 0);
    window.addEventListener("resize", update, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("resize", update); };
  }, [step, steps]);

  const next = () => {
    if (step < steps.length - 1) setStep((s) => s + 1);
    else onDone();
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const current = steps[step];

  // Work out where to place the tooltip card — always stays inside the viewport
  let cardStyle = {};
  const CARD_W = 280;
  const CARD_H = 200; // approximate
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  if (!rect || current.position === "center") {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  } else {
    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceBelow = vh - (rect.top + rect.height);

    let left, top;

    if (rect.width > vw * 0.5) {
      // Wide element (e.g. full-width filter bar) — place below or above
      left = Math.max(8, Math.min(rect.left, vw - CARD_W - 8));
      top = spaceBelow > CARD_H + 16
        ? rect.top + rect.height + 12
        : rect.top - CARD_H - 12;
    } else if (spaceRight > CARD_W + 24) {
      // Place to the right
      left = rect.left + rect.width + 16;
      top = Math.max(8, Math.min(rect.top + rect.height / 2 - 90, vh - CARD_H - 8));
    } else if (spaceLeft > CARD_W + 24) {
      // Place to the left
      left = rect.left - CARD_W - 16;
      top = Math.max(8, Math.min(rect.top + rect.height / 2 - 90, vh - CARD_H - 8));
    } else {
      // Fallback: below, centred on screen
      left = Math.max(8, vw / 2 - CARD_W / 2);
      top = Math.min(rect.top + rect.height + 12, vh - CARD_H - 8);
    }

    // Final clamp to viewport
    left = Math.max(8, Math.min(left, vw - CARD_W - 8));
    top = Math.max(8, Math.min(top, vh - CARD_H - 8));
    cardStyle = { position: "fixed", top, left };
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dim backdrop — touch-action:pan-y lets scroll gestures pass through on iOS */}
      <div className="absolute inset-0 bg-navy-950/60 pointer-events-auto" style={{ touchAction: "pan-y" }} onClick={onDone} />

      {/* Spotlight — cut-out around the target element */}
      {rect && current.position !== "center" && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.60)",
            outline: "2px solid #3FA34D",
            outlineOffset: "2px",
            background: "transparent",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[280px] rounded-2xl bg-white p-4 shadow-2xl pointer-events-auto"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div className="mb-3 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-brand-500" : "w-1.5 bg-navy-200"}`} />
          ))}
          <button
            onClick={onDone}
            className="ml-auto grid h-6 w-6 place-items-center rounded-full text-navy-400 hover:bg-navy-100"
            aria-label="Skip"
          >
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
          {current.label}
        </p>
        <h3 className="mb-1.5 text-sm font-bold text-navy-900">{current.title}</h3>
        <p className="text-xs leading-relaxed text-navy-600">{current.body}</p>

        {/* Navigation */}
        <div className="mt-4 flex items-center justify-between">
          {!isFirst ? (
            <button onClick={prev} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-500 hover:bg-navy-100">
              <FiArrowLeft className="h-3 w-3" /> Back
            </button>
          ) : <span />}
          <button
            onClick={next}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            {isLast ? "Got it ✓" : <>Next <FiArrowRight className="h-3 w-3" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Full-app guided tour — navigates to each section before highlighting.
const APP_TOUR_STEPS = [
  { label: "Welcome",  title: "Welcome to LCL Ops",       body: "This quick tour walks through each section. Click Next and we'll take you there.",  position: "center", route: null },
  { label: "Dashboard", title: "Your command centre",       body: "See active jobs, today's schedule, outstanding invoices and renewal reminders — all at a glance.", selector: ".stat-cards", route: "/" },
  { label: "Dispatch",  title: "Assign & track engineers",  body: "Engineer columns by day. See who's doing what, drag jobs between engineers, use the mini calendar to jump dates.", selector: ".dispatch-calendar", route: "/dispatch" },
  { label: "Jobs",      title: "Your full job pipeline",    body: "Create quotes, track status from Quote → Paid, generate invoices, send emails and upload certificates.", selector: ".jobs-status-filter", route: "/jobs" },
  { label: "Clients",   title: "Client directory",          body: "Every client, their properties, certificate history and lifetime value — in one searchable list.", selector: ".clients-list", route: "/clients" },
  { label: "Engineers", title: "Your engineer roster",      body: "Add engineers, set their % cut, track their jobs and revenue — all from the Engineers section.", selector: null, route: "/engineers", position: "center" },
  { label: "Reports",   title: "Revenue & P&L",             body: "See revenue, net profit after engineer costs, company expenses and the full pipeline funnel.", selector: null, route: "/reports", position: "center" },
  { label: "Done!",     title: "You're all set 🎉",          body: "Explore freely. You can replay this tour any time from Help & Docs → Guided tour.", position: "center", route: null },
];

export default function OnboardingTour({ forceShow, onDone }) {
  const [active, setActive] = useState(forceShow ? true : false);
  const [step, setStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (forceShow) { setActive(true); setStep(0); return; }
    const toured = getTouredSections();
    if (!toured.includes("app-tour")) { setActive(true); setStep(0); }
  }, [forceShow]);

  const navigateAndAdvance = useCallback((nextStep) => {
    const s = APP_TOUR_STEPS[nextStep];
    if (s?.route) {
      router.push(s.route);
      // Wait for navigation before rendering the step
      setTimeout(() => setStep(nextStep), 400);
    } else {
      setStep(nextStep);
    }
  }, [router]);

  const handleDone = useCallback(() => {
    setActive(false);
    setStep(0);
    markToured("app-tour");
    onDone?.();
  }, [onDone]);

  if (!active) return null;

  const current = APP_TOUR_STEPS[step];
  const isLast = step === APP_TOUR_STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <NavAwareTourOverlay
      steps={APP_TOUR_STEPS}
      step={step}
      isFirst={isFirst}
      isLast={isLast}
      onNext={() => isLast ? handleDone() : navigateAndAdvance(step + 1)}
      onPrev={() => navigateAndAdvance(Math.max(0, step - 1))}
      onDone={handleDone}
    />
  );
}

function NavAwareTourOverlay({ steps, step, isFirst, isLast, onNext, onPrev, onDone }) {
  const [rect, setRect] = useState(null);
  const current = steps[step];

  useEffect(() => {
    const update = () => setRect(current?.selector ? getRect(current.selector) : null);
    const needsNav = openMobileNavIfNeeded(current?.selector);
    const t = setTimeout(update, needsNav ? 400 : 150); // wait for page / drawer to settle
    window.addEventListener("resize", update, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("resize", update); };
  }, [step, current]);

  const PAD = 10;
  const CARD_W = 280;
  const CARD_H = 210;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  if (rect && current.position !== "center") {
    const spaceRight = vw - (rect.left + rect.width);
    let left, top;
    if (rect.width > vw * 0.5) {
      left = Math.max(8, Math.min(rect.left, vw - CARD_W - 8));
      top = (vh - (rect.top + rect.height)) > CARD_H + 16 ? rect.top + rect.height + 12 : rect.top - CARD_H - 12;
    } else if (spaceRight > CARD_W + 24) {
      left = rect.left + rect.width + 16;
      top = Math.max(8, Math.min(rect.top + rect.height / 2 - 90, vh - CARD_H - 8));
    } else {
      left = Math.max(8, rect.left - CARD_W - 16);
      top = Math.max(8, Math.min(rect.top + rect.height / 2 - 90, vh - CARD_H - 8));
    }
    left = Math.max(8, Math.min(left, vw - CARD_W - 8));
    top = Math.max(8, Math.min(top, vh - CARD_H - 8));
    cardStyle = { position: "fixed", top, left };
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute inset-0 bg-navy-950/60 pointer-events-auto" style={{ touchAction: "pan-y" }} onClick={onDone} />
      {rect && current.position !== "center" && (
        <div className="absolute rounded-xl pointer-events-none"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.60)", outline: "2px solid #3FA34D", outlineOffset: "2px", background: "transparent" }} />
      )}
      <div className="absolute w-[280px] rounded-2xl bg-white p-4 shadow-2xl pointer-events-auto" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-brand-500" : "w-1.5 bg-navy-200"}`} />
          ))}
          <button onClick={onDone} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-navy-400 hover:bg-navy-100" aria-label="Skip">
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-600">{current.label}</p>
        <h3 className="mb-1.5 text-sm font-bold text-navy-900">{current.title}</h3>
        <p className="text-xs leading-relaxed text-navy-600">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          {!isFirst ? (
            <button onClick={onPrev} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-500 hover:bg-navy-100">
              <FiArrowLeft className="h-3 w-3" /> Back
            </button>
          ) : <span />}
          <button onClick={onNext} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
            {isLast ? "Done ✓" : <>Next <FiArrowRight className="h-3 w-3" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

