"use client";

// Full-page notification inbox. Same source of truth as the bell dropdown
// (lib/notifications.buildNotifications) so counts + items match. Left
// sidebar filters by read-state and by type (tasks / replies / etc);
// main area is a Gmail-style scrollable list with bulk read/dismiss.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FiBell, FiCheckSquare, FiUser, FiUsers, FiAlertTriangle, FiClock,
  FiCornerDownLeft, FiCheck, FiInbox, FiTrash2, FiExternalLink,
} from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { buildNotifications, KINDS } from "@/lib/notifications";
import { priorityMeta } from "@/lib/tasks";

const SEEN_KEY = "lcl-seen-activity";

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function saveSeen(set) {
  const arr = [...set].slice(-1000);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr)); } catch {}
  if (supabase) supabase.auth.updateUser({ data: { seen_notifications: arr } }).catch(() => {});
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

const CATEGORY_ORDER = [
  { key: "unread",        label: "Unread",        icon: FiBell },
  { key: "all",           label: "All",           icon: FiInbox },
  { key: "read",          label: "Read",          icon: FiCheck },
];
const TYPE_ORDER = [
  { key: "task_overdue",  label: "Overdue",       icon: FiAlertTriangle, tone: "text-rose-500" },
  { key: "task_due",      label: "Due today",     icon: FiClock,         tone: "text-amber-500" },
  { key: "task_upcoming", label: "Assigned to me", icon: FiUser,         tone: "text-blue-500" },
  { key: "task_team",     label: "Team tasks",    icon: FiUsers,         tone: "text-violet-500" },
  { key: "reply",         label: "Client replies", icon: FiCornerDownLeft, tone: "text-blue-500" },
];

function Inner() {
  const { user } = useAuth();
  const { jobs, clients } = useStore();
  const [tasks, setTasks] = useState([]);
  const [seen, setSeen] = useState(() => loadSeen());
  const [category, setCategory] = useState("unread");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("tasks").select("id,data").order("updated_at", { ascending: false }).limit(500);
      if (!cancelled) setTasks((data || []).map((r) => r.data));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const items = useMemo(
    () => buildNotifications({ tasks, jobs, clients, userId: user?.id }),
    [tasks, jobs, clients, user?.id]
  );

  const counts = useMemo(() => {
    const c = { all: items.length, unread: 0, read: 0 };
    const byType = {};
    for (const it of items) {
      if (seen.has(it.id)) c.read++; else c.unread++;
      byType[it.kind] = (byType[it.kind] || 0) + 1;
    }
    return { ...c, byType };
  }, [items, seen]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (category === "unread" && seen.has(it.id)) return false;
      if (category === "read" && !seen.has(it.id)) return false;
      if (typeFilter !== "all" && it.kind !== typeFilter) return false;
      return true;
    });
  }, [items, category, typeFilter, seen]);

  const isNew = (id) => !seen.has(id);

  const markSelectedRead = () => {
    setSeen((prev) => {
      const next = new Set(prev);
      selected.forEach((id) => next.add(id));
      saveSeen(next);
      return next;
    });
    setSelected(new Set());
  };
  const markAllRead = () => {
    setSeen((prev) => {
      const next = new Set(prev);
      filtered.forEach((it) => next.add(it.id));
      saveSeen(next);
      return next;
    });
    setSelected(new Set());
  };
  const markSelectedUnread = () => {
    setSeen((prev) => {
      const next = new Set(prev);
      selected.forEach((id) => next.delete(id));
      saveSeen(next);
      return next;
    });
    setSelected(new Set());
  };
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const allChecked = filtered.every((it) => selected.has(it.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((it) => next.delete(it.id));
      else filtered.forEach((it) => next.add(it.id));
      return next;
    });
  };

  const rowClickBehaviour = useCallback((it) => {
    setSeen((prev) => {
      if (prev.has(it.id)) return prev;
      const next = new Set(prev);
      next.add(it.id);
      saveSeen(next);
      return next;
    });
  }, []);

  return (
    <>
      <PageHeader
        icon={FiBell}
        title="Notifications"
        subtitle="Every task, reply and reminder — routed to the right person"
        actions={
          filtered.length > 0 && (
            <button className="btn-outline text-sm" onClick={markAllRead}>
              <FiCheck /> Mark all read
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ── Sidebar ── */}
        <aside className="space-y-6">
          <SidebarGroup title="Show">
            {CATEGORY_ORDER.map((c) => {
              const Icon = c.icon;
              const n = c.key === "all" ? counts.all : c.key === "unread" ? counts.unread : counts.read;
              return (
                <SidebarButton
                  key={c.key}
                  active={category === c.key}
                  onClick={() => setCategory(c.key)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{c.label}</span>
                  <span className="rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-600 dark:bg-white/10 dark:text-slate-300">{n}</span>
                </SidebarButton>
              );
            })}
          </SidebarGroup>
          <SidebarGroup title="Type">
            <SidebarButton
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            >
              <FiInbox className="h-4 w-4 text-navy-400" />
              <span className="flex-1">All types</span>
              <span className="rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-600 dark:bg-white/10 dark:text-slate-300">{counts.all}</span>
            </SidebarButton>
            {TYPE_ORDER.map((t) => {
              const Icon = t.icon;
              const n = counts.byType[t.key] || 0;
              if (n === 0) return null;
              return (
                <SidebarButton
                  key={t.key}
                  active={typeFilter === t.key}
                  onClick={() => setTypeFilter(t.key)}
                >
                  <Icon className={`h-4 w-4 ${t.tone}`} />
                  <span className="flex-1">{t.label}</span>
                  <span className="rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-600 dark:bg-white/10 dark:text-slate-300">{n}</span>
                </SidebarButton>
              );
            })}
          </SidebarGroup>
          <p className="text-[10px] text-navy-400 dark:text-slate-500">
            You only see notifications for tasks assigned to you and team-wide items. Everyone&apos;s inbox is private.
          </p>
        </aside>

        {/* ── List ── */}
        <section>
          {/* Toolbar */}
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-navy-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-navy-900">
            <input
              type="checkbox"
              onChange={toggleSelectAll}
              checked={filtered.length > 0 && filtered.every((it) => selected.has(it.id))}
              className="h-4 w-4 cursor-pointer rounded border-navy-300"
              aria-label="Select all visible"
            />
            {selected.size > 0 ? (
              <>
                <span className="text-xs font-semibold text-navy-700 dark:text-slate-200">{selected.size} selected</span>
                <button onClick={markSelectedRead}   className="rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-800 dark:bg-white/15 dark:hover:bg-white/25"><FiCheck className="inline h-3 w-3 mr-1" />Mark read</button>
                <button onClick={markSelectedUnread} className="rounded-lg border border-navy-200 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50 dark:border-white/10 dark:text-slate-200">Mark unread</button>
                <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-navy-400 hover:text-navy-700 dark:hover:text-white">Clear</button>
              </>
            ) : (
              <span className="text-xs text-navy-500 dark:text-slate-400">
                {filtered.length} notification{filtered.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-navy-200 py-16 text-center dark:border-white/10">
              <FiCheck className="mx-auto mb-2 h-8 w-8 text-brand-500" />
              <p className="text-sm font-semibold text-navy-700 dark:text-slate-200">
                {category === "unread" ? "Inbox zero." : "Nothing here."}
              </p>
              <p className="mt-1 text-xs text-navy-400">
                {category === "unread" ? "All notifications have been read." : "Try a different filter."}
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-navy-100 dark:border-white/10">
              {filtered.map((it) => (
                <NotificationRow
                  key={it.id}
                  item={it}
                  isNew={isNew(it.id)}
                  selected={selected.has(it.id)}
                  onToggleSelect={() => toggleSelect(it.id)}
                  onClick={() => rowClickBehaviour(it)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function SidebarGroup({ title, children }) {
  return (
    <div>
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-navy-400 dark:text-slate-500">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function SidebarButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
        active
          ? "bg-navy-900 text-white dark:bg-white/15"
          : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function iconFor(kind) {
  const map = {
    task_overdue:  FiAlertTriangle,
    task_due:      FiClock,
    task_upcoming: FiCheckSquare,
    task_team:     FiUsers,
    reply:         FiCornerDownLeft,
  };
  return map[kind] || FiBell;
}
function toneFor(kind) {
  return {
    task_overdue:  "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
    task_due:      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    task_upcoming: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    task_team:     "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
    reply:         "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  }[kind] || "bg-navy-100 text-navy-600";
}

function NotificationRow({ item, isNew, selected, onToggleSelect, onClick }) {
  const Icon = iconFor(item.kind);
  const kindMeta = KINDS[item.kind] || {};
  const task = item.task;
  const p = task ? priorityMeta(task.priority) : null;

  return (
    <li className={`flex items-start gap-3 border-b border-navy-100 px-3 py-3 last:border-b-0 transition dark:border-white/5 ${
      selected ? "bg-brand-50/60 dark:bg-brand-500/5" : isNew ? "bg-white hover:bg-navy-50 dark:bg-navy-900 dark:hover:bg-white/[0.03]" : "bg-navy-50/40 hover:bg-navy-50 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
    }`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-navy-300"
      />
      <Link href={item.url} onClick={onClick} className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneFor(item.kind)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">{kindMeta.label || item.kind}</span>
            {p && (
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${p.chip}`}>
                <span className={`h-1 w-1 rounded-full ${p.dot}`} />{p.label}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[10px] text-navy-400 dark:text-slate-500">{fmtDate(item.at)}</span>
          </div>
          <p className={`mt-0.5 truncate text-sm ${isNew ? "font-semibold text-navy-900 dark:text-white" : "text-navy-600 dark:text-slate-300"}`}>
            {item.title}
          </p>
          {item.subtitle && (
            <p className="mt-0.5 truncate text-xs text-navy-500 dark:text-slate-400">{item.subtitle}</p>
          )}
        </div>
        <FiExternalLink className="mt-2 h-3.5 w-3.5 shrink-0 text-navy-300 dark:text-slate-600" />
      </Link>
      {isNew && <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
    </li>
  );
}
