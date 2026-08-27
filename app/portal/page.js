"use client";

import { useMemo } from "react";
import { FaHardHat } from "react-icons/fa";
import {
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiClock,
  FiMail,
} from "react-icons/fi";
import { isToday, isFuture, isPast, parseISO, compareAsc, compareDesc } from "date-fns";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { gbp } from "@/lib/format";
import { getPeriodRange, computeEngineerPay } from "@/lib/stats";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import JobCard from "@/components/JobCard";

const DONE_STATUSES = ["completed", "invoiced", "paid"];

function jobWhen(job) {
  if (!job.scheduledAt) return null;
  try {
    return parseISO(job.scheduledAt);
  } catch {
    return null;
  }
}

function Section({ title, count, children, empty }) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 section-label text-sm">
        {title}
        {typeof count === "number" && (
          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-500">
            {count}
          </span>
        )}
      </h2>
      {count === 0 ? (
        <div className="card p-6 text-center text-sm text-navy-400">{empty}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </div>
  );
}

export default function PortalPage() {
  const { user } = useAuth();
  const { jobs: allJobs, engineers, engineerPayments, hydrated } = useStore();
  const myEngId = useMyEngineerId();
  const myEngineer = engineers.find((e) => e.id === myEngId);

  const jobs = useMemo(
    () => (myEngId ? allJobs.filter((j) => jobBelongsToEngineer(j, myEngId)) : []),
    [allJobs, myEngId]
  );

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((j) => {
          const d = jobWhen(j);
          return d && isToday(d) && !DONE_STATUSES.includes(j.status) && j.status !== "cancelled";
        })
        .sort((a, b) => compareAsc(jobWhen(a), jobWhen(b))),
    [jobs]
  );

  const upcomingJobs = useMemo(
    () =>
      jobs
        .filter((j) => {
          const d = jobWhen(j);
          return d && isFuture(d) && !isToday(d) && !DONE_STATUSES.includes(j.status) && j.status !== "cancelled";
        })
        .sort((a, b) => compareAsc(jobWhen(a), jobWhen(b)))
        .slice(0, 9),
    [jobs]
  );

  const inProgressJobs = useMemo(
    () => jobs.filter((j) => j.status === "in_progress" && !(jobWhen(j) && isToday(jobWhen(j)))),
    [jobs]
  );

  const recentJobs = useMemo(
    () =>
      jobs
        .filter((j) => DONE_STATUSES.includes(j.status))
        .sort((a, b) => {
          const da = jobWhen(a) || new Date(0);
          const db = jobWhen(b) || new Date(0);
          return compareDesc(da, db);
        })
        .slice(0, 6),
    [jobs]
  );

  const overdueJobs = useMemo(
    () =>
      jobs.filter((j) => {
        const d = jobWhen(j);
        return d && isPast(d) && !isToday(d) && !DONE_STATUSES.includes(j.status) && j.status !== "cancelled";
      }),
    [jobs]
  );

  // This week's jobs total + this month's earnings estimate (based on cut %).
  const weekRange = useMemo(() => getPeriodRange("week", new Date()), []);
  const monthRange = useMemo(() => getPeriodRange("month", new Date()), []);
  const weekJobCount = useMemo(
    () => jobs.filter((j) => {
      const d = jobWhen(j);
      return d && d >= weekRange.start && d <= weekRange.end;
    }).length,
    [jobs, weekRange]
  );
  const pay = useMemo(
    () => computeEngineerPay(allJobs, monthRange, engineers, engineerPayments),
    [allJobs, monthRange, engineers, engineerPayments]
  );
  const myPay = pay.rows.find((r) => r.id === myEngId);

  if (!hydrated) {
    return (
      <>
        <PageHeader icon={FaHardHat} title="My Jobs" subtitle="Loading your schedule…" />
        <div className="p-4 sm:p-8">
          <div className="card p-10 text-center text-sm text-navy-400">Loading…</div>
        </div>
      </>
    );
  }

  // Engineer-role account with no matching Engineers record yet.
  if (!myEngId) {
    return (
      <>
        <PageHeader icon={FaHardHat} title="My Jobs" subtitle="Your engineer portal" />
        <div className="p-4 sm:p-8">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500">
              <FiMail className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-bold text-navy-900">Account not linked yet</h2>
            <p className="mt-2 text-sm text-navy-500">
              Your login isn&rsquo;t linked to an engineer profile, so we can&rsquo;t show your jobs yet.
              Ask an admin to add an Engineer record using this exact email address:
            </p>
            <p className="mt-3 inline-block rounded-lg bg-navy-50 px-3 py-1.5 font-mono text-sm font-semibold text-navy-800">
              {user?.email}
            </p>
            <p className="mt-3 text-xs text-navy-400">
              Settings → Engineers → set this address as the engineer&rsquo;s email.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={FaHardHat}
        title="My Jobs"
        subtitle={`Welcome back, ${myEngineer?.name || user?.username || ""}${
          myEngineer?.payType === "weekly" ? ` · £${myEngineer.weeklyRate || 0}/week`
          : myEngineer?.payType === "fixed_gas" ? " · fixed rate per job"
          : myEngineer?.payType === "fixed_service" ? " · fixed rate per service"
          : ` · ${myEngineer?.cutPercent ?? 40}% cut`
        }`}
      />

      <div className="space-y-6 p-4 sm:p-8 lg:max-w-[1100px]">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            tone="brand"
            icon={FiCalendar}
            label="Today"
            value={todayJobs.length}
            sub="Jobs scheduled today"
          />
          <StatCard
            tone="navy"
            icon={FiBriefcase}
            label="This week"
            value={weekJobCount}
            sub="Jobs on your schedule"
          />
          <StatCard
            tone="light"
            icon={FiCheckCircle}
            label="Completed"
            value={pay?.rows ? (jobs.filter((j) => DONE_STATUSES.includes(j.status)).length) : 0}
            sub="All time"
          />
          <StatCard
            tone="green"
            icon={FiDollarSign}
            label="Owed this month"
            value={gbp(myPay?.owed || 0)}
            sub={myPay?.balance ? `${gbp(myPay.balance)} outstanding` : "All settled"}
          />
        </div>

        {overdueJobs.length > 0 && (
          <div className="card flex items-center gap-3 border-rose-200 bg-rose-50 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <FiClock />
            </span>
            <p className="text-sm font-semibold text-rose-700">
              {overdueJobs.length} job{overdueJobs.length !== 1 ? "s" : ""} {overdueJobs.length !== 1 ? "are" : "is"} overdue — open below to update.
            </p>
          </div>
        )}

        <Section title="Today" count={todayJobs.length} empty="Nothing scheduled for today.">
          {todayJobs.map((job) => <JobCard key={job.id} job={job} />)}
        </Section>

        {inProgressJobs.length > 0 && (
          <Section title="In progress" count={inProgressJobs.length} empty="">
            {inProgressJobs.map((job) => <JobCard key={job.id} job={job} />)}
          </Section>
        )}

        {overdueJobs.length > 0 && (
          <Section title="Overdue" count={overdueJobs.length} empty="">
            {overdueJobs.map((job) => <JobCard key={job.id} job={job} />)}
          </Section>
        )}

        <Section title="Up next" count={upcomingJobs.length} empty="No upcoming jobs scheduled.">
          {upcomingJobs.map((job) => <JobCard key={job.id} job={job} />)}
        </Section>

        <Section title="Recently completed" count={recentJobs.length} empty="No completed jobs yet.">
          {recentJobs.map((job) => <JobCard key={job.id} job={job} />)}
        </Section>
      </div>
    </>
  );
}
