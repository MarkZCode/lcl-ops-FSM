// Dispatch helpers — conflict detection between an engineer's jobs on the
// same day, and a rough travel-time flag between consecutive bookings.

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// A job's booked window in minutes-from-midnight. Falls back to a 60-minute
// slot starting at scheduledAt's time when no explicit window is set.
function jobWindow(job) {
  const start = toMinutes(job.windowFrom) ?? (job.scheduledAt ? new Date(job.scheduledAt).getHours() * 60 + new Date(job.scheduledAt).getMinutes() : null);
  if (start == null) return null;
  const end = toMinutes(job.windowTo) ?? start + 60;
  return { start, end: Math.max(end, start + 1) };
}

// Returns a Set of job ids that overlap with another job for the same
// engineer on the same day. Unassigned jobs are never flagged.
export function detectConflicts(jobs) {
  const conflicts = new Set();
  const byEngDay = new Map();
  for (const j of jobs) {
    if (!j.scheduledAt || !j.engineerId || j.engineerId === "unassigned") continue;
    const dayKey = new Date(j.scheduledAt).toDateString();
    const key = `${j.engineerId}|${dayKey}`;
    if (!byEngDay.has(key)) byEngDay.set(key, []);
    byEngDay.get(key).push(j);
  }
  for (const group of byEngDay.values()) {
    if (group.length < 2) continue;
    const withWindow = group.map((j) => ({ job: j, w: jobWindow(j) })).filter((g) => g.w);
    for (let i = 0; i < withWindow.length; i++) {
      for (let k = i + 1; k < withWindow.length; k++) {
        const a = withWindow[i].w, b = withWindow[k].w;
        if (a.start < b.end && b.start < a.end) {
          conflicts.add(withWindow[i].job.id);
          conflicts.add(withWindow[k].job.id);
        }
      }
    }
  }
  return conflicts;
}

// True when a job was created by converting a renewal prospect (the only
// convert-to-job path that currently exists) — surfaced as a small badge on
// the dispatch card so the agent can see which bookings came from outreach.
export function isFromOutreach(job) {
  return Boolean(job.prospectId);
}
