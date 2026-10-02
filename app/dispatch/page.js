"use client";

import { useState, useMemo } from "react";
import { FiPlus, FiColumns, FiCalendar, FiUser, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { format, isToday, isSameDay, parseISO, startOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { useStore } from "@/lib/store";
import PageHeader from "@/components/PageHeader";
import DaySheets from "@/components/DaySheets";
import DispatchBoard from "@/components/DispatchBoard";
import MiniCalendar from "@/components/MiniCalendar";
import WeekCapacity from "@/components/WeekCapacity";
import EngineerScheduleView from "@/components/EngineerScheduleView";
import JobModal from "@/components/JobModal";
import { useSectionTour } from "@/components/OnboardingTour";

export default function DispatchPage() {
  const { jobs } = useStore();
  const [day, setDay] = useState(new Date());
  const [view, setView] = useState("day"); // "day" | "week" | "engineer"
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [weekRef, setWeekRef] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [modalOpen, setModalOpen] = useState(false);

  const tour = useSectionTour("dispatch", [
    {
      selector: ".dispatch-calendar",
      label: "Dispatch",
      title: "Pick a day",
      body: "Use the calendar on the left to jump to any date. Dots show days that have jobs scheduled.",
    },
    {
      selector: ".dispatch-board",
      label: "Dispatch",
      title: "Engineer columns",
      body: "Each engineer gets a column. Drag job cards between columns to reassign. Unassigned jobs sit in their own column.",
    },
  ]);

  // Map of yyyy-MM-dd -> job count, for dots in the mini calendar.
  const counts = useMemo(() => {
    const m = {};
    jobs.forEach((j) => {
      if (!j.scheduledAt) return;
      const key = format(parseISO(j.scheduledAt), "yyyy-MM-dd");
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [jobs]);

  const count = useMemo(
    () =>
      jobs.filter(
        (j) => j.scheduledAt && isSameDay(parseISO(j.scheduledAt), day)
      ).length,
    [jobs, day]
  );

  return (
    <>
      {tour}
      <PageHeader
        icon={FiColumns}
        title="Dispatch Board"
        subtitle="Schedule and assign jobs across your engineers"
        actions={
          <>
            <button className="btn-outline shrink-0" onClick={() => setSheetsOpen(true)} title="Each engineer's jobs for the chosen day, to send or print">
              <FiCalendar /> <span className="hidden sm:inline">Day sheets</span>
            </button>
            <button className="btn-primary shrink-0" onClick={() => setModalOpen(true)}>
              <FiPlus /> <span className="hidden sm:inline">New job</span><span className="sm:hidden">New</span>
            </button>
          </>
        }
      />

      {/* View switcher. It used to live in the PageHeader `actions` slot,
          which on a phone put three labelled buttons plus "New job" into the
          same row as the title — so it wrapped onto two lines and pushed the
          board down the screen. Given its own row it fits comfortably. */}
      <div className="px-4 pt-4 sm:px-8">
        <div className="scroll-area flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-navy-200 bg-white p-0.5 sm:w-max dark:border-white/10 dark:bg-white/[0.04]">
          {[["day", FiColumns, "Day"], ["week", FiCalendar, "Week"], ["engineer", FiUser, "Engineer"]].map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                view === key ? "bg-navy-800 text-white" : "text-navy-500 hover:bg-navy-50 dark:hover:bg-white/[0.06]"
              }`}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "engineer" ? (
        <div className="page">
          <EngineerScheduleView />
        </div>
      ) : view === "week" ? (
        <div className="page space-y-3">
          <div className="flex items-center gap-3">
            <button className="btn-outline py-1 text-xs" onClick={() => setWeekRef(w => subWeeks(w, 1))}>← Prev</button>
            <span className="text-sm font-semibold text-navy-800">
              {format(weekRef, "d MMM")} – {format(addWeeks(weekRef, 1), "d MMM yyyy")}
            </span>
            <button className="btn-outline py-1 text-xs" onClick={() => setWeekRef(w => addWeeks(w, 1))}>Next →</button>
            <button className="btn-outline py-1 text-xs" onClick={() => setWeekRef(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
          </div>
          <WeekCapacity weekRef={weekRef} onPickDay={(d) => { setDay(d); setView("day"); }} />
        </div>
      ) : (
      <>
      {/* Phone day stepper. The mini calendar is the day picker on desktop but
          is far too tall for a phone, and hiding it left no way to change day
          at all — so the day gets its own compact control here. */}
      <div className="flex items-center gap-2 px-4 pt-4 lg:hidden">
        <button
          onClick={() => setDay((d) => addDays(d, -1))}
          aria-label="Previous day"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-navy-200 text-navy-600 dark:border-white/10"
        >
          <FiChevronLeft />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className={`truncate text-sm font-semibold ${isToday(day) ? "text-brand-600" : "text-navy-900"}`}>
            {isToday(day) ? "Today" : format(day, "EEE d MMM")}
          </p>
          <p className="text-[11px] text-navy-500">{count} job{count !== 1 ? "s" : ""} booked</p>
        </div>
        <button
          onClick={() => setDay((d) => addDays(d, 1))}
          aria-label="Next day"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-navy-200 text-navy-600 dark:border-white/10"
        >
          <FiChevronRight />
        </button>
        {!isToday(day) && (
          <button onClick={() => setDay(new Date())} className="btn-outline shrink-0 py-1.5 text-xs">
            Today
          </button>
        )}
      </div>

      {/* page-wide: the engineer columns are the one view that genuinely
          wants the whole display — constraining it would just add a scrollbar. */}
      <div className="page page-wide flex flex-col gap-5 lg:flex-row">
        {/* Left rail: compact mini calendar */}
        <div className="dispatch-calendar hidden w-full shrink-0 lg:block lg:w-52">
          <MiniCalendar selected={day} onSelect={setDay} counts={counts} />
          <div className="card mt-3 flex items-center justify-between p-3">
            <div>
              <p className={`text-xs font-bold ${isToday(day) ? "text-brand-600" : "text-navy-900"}`}>
                {format(day, "EEE d MMM")}
              </p>
              <p className="text-[11px] text-navy-500">{format(day, "yyyy")}</p>
            </div>
            <span className="rounded-md bg-navy-50 px-2 py-1 text-xs font-semibold text-navy-600">
              {count} job{count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {/* Main: engineer columns */}
        <div className="dispatch-board min-w-0 flex-1">
          <DispatchBoard day={day} />
        </div>
      </div>
      </>
      )}

      <JobModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <DaySheets open={sheetsOpen} onClose={() => setSheetsOpen(false)} day={day} />
    </>
  );
}
