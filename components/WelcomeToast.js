"use client";

import { useEffect, useState } from "react";
import { FiX, FiTrendingUp } from "react-icons/fi";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { gbp } from "@/lib/format";
import { isToday, parseISO, startOfWeek, isWithinInterval, endOfWeek } from "date-fns";

export default function WelcomeToast() {
  const { user } = useAuth();
  const { jobs } = useStore();
  const [show, setShow] = useState(false);
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    let justLoggedIn = false;
    try {
      justLoggedIn = sessionStorage.getItem("lcl-welcome") === "1";
      if (justLoggedIn) sessionStorage.removeItem("lcl-welcome");
    } catch {}
    if (!justLoggedIn) return;

    setShow(true);
    const a = setTimeout(() => setEnter(true), 30);
    const b = setTimeout(() => setEnter(false), 7500);
    const c = setTimeout(() => setShow(false), 7900);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, []);

  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  if (!show) return null;

  const isAdmin = user?.role === "admin";
  const first = (user?.username || user?.name || "").split(" ")[0] || "there";

  // Admin insight: this week's collected revenue + outstanding
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekJobs = jobs.filter((j) => {
    const d = j.scheduledAt || j.createdAt;
    if (!d) return false;
    try { return isWithinInterval(parseISO(d), { start: weekStart, end: weekEnd }); } catch { return false; }
  });
  const weekRevenue = weekJobs.filter((j) => ["completed","invoiced","paid"].includes(j.status))
    .reduce((s, j) => s + (j.price || 0), 0);
  const todayJobs = jobs.filter((j) => j.scheduledAt && isToday(parseISO(j.scheduledAt))).length;
  const outstanding = jobs.filter((j) => j.status === "invoiced").reduce((s, j) => s + (j.price || 0), 0);

  return (
    <div
      className={`fixed inset-x-4 bottom-20 z-50 transition-all duration-300 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[320px] ${
        enter ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className={`relative overflow-hidden rounded-2xl shadow-2xl ${
        isAdmin
          ? "bg-navy-900 text-white"
          : "border border-brand-200 bg-white"
      }`}>
        <div className="relative flex items-start gap-3 p-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl ${
            isAdmin ? "bg-brand-500/20" : "bg-brand-50"
          }`}>
            {isAdmin ? "✦" : "👋"}
          </span>

          <div className="min-w-0 flex-1">
            {isAdmin ? (
              <>
                <p className="font-bold text-white">
                  {greeting}, Sir.
                </p>
                <p className="mt-0.5 text-xs text-navy-300">
                  {greeting === "Good morning" ? "Ready to run the day?" : "Here's where things stand:"}
                </p>
                {/* Revenue insight strip */}
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-white/8 px-2 py-1.5 text-center" style={{background:"rgba(255,255,255,0.07)"}}>
                    <p className="text-[10px] font-medium text-navy-400">This week</p>
                    <p className="text-xs font-bold text-brand-400">{gbp(weekRevenue)}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 text-center" style={{background:"rgba(255,255,255,0.07)"}}>
                    <p className="text-[10px] font-medium text-navy-400">Today</p>
                    <p className="text-xs font-bold text-white">{todayJobs} job{todayJobs !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 text-center" style={{background: outstanding > 0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.07)"}}>
                    <p className="text-[10px] font-medium text-navy-400">Owed</p>
                    <p className={`text-xs font-bold ${outstanding > 0 ? "text-amber-400" : "text-white"}`}>{gbp(outstanding)}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="font-bold text-navy-900 break-words">
                  {greeting}, {first}!
                </p>
                <p className="text-sm text-navy-500">
                  {todayJobs > 0 ? `You have ${todayJobs} job${todayJobs !== 1 ? "s" : ""} today.` : "No jobs scheduled today — enjoy the quiet! 😄"}
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => { setEnter(false); setTimeout(() => setShow(false), 300); }}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${
              isAdmin ? "text-navy-400 hover:bg-white/10" : "text-navy-400 hover:bg-navy-100"
            }`}
            aria-label="Dismiss"
          >
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
