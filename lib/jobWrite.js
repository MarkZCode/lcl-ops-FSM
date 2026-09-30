// How a job change is applied to the SERVER's current copy (see
// saveJobSafely in lib/store.js). Pure, so the rules can be tested.
//
// The bug this exists for: saves used to upload this device's whole copy of
// the job. A device with an out-of-date copy then overwrote newer work from
// another device — invoiced jobs reappeared as In progress (JOB-7821,
// JOB-1494), with the history of the change gone too.
import { reconcileJob } from "./visits";

// Union two activity lists by id (server first).
export function mergeActivity(serverList, localList) {
  const seen = new Set();
  const out = [];
  for (const a of [...(serverList || []), ...(localList || [])]) {
    const k = a?.id || `${a?.at}|${a?.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

// Close the current status-history entry and open one for the new status.
export function withStatusHistory(prevJob, nextJob, now) {
  if (nextJob.status === prevJob.status) return nextJob;
  const prevHistory = Array.isArray(prevJob.statusHistory) ? prevJob.statusHistory : [];
  const lastIdx = prevHistory.length - 1;
  const closed = lastIdx >= 0 && !prevHistory[lastIdx].exitedAt
    ? [...prevHistory.slice(0, lastIdx), { ...prevHistory[lastIdx], exitedAt: now }]
    : prevHistory;
  return { ...nextJob, statusHistory: [...closed, { status: nextJob.status, enteredAt: now, exitedAt: null, by: "" }] };
}

// Apply `patch` — made on this device while it showed `snapshot` — onto the
// server's current copy. Returns { next, conflict }.
//   • Fields in the patch win; everything else keeps the server's value.
//   • A status equal to what this device showed isn't a change (the Edit
//     modal re-sends it with every save), so it can't overwrite a newer one.
//   • A status change made while looking at an out-of-date status is
//     refused (conflict) — the newer status stands.
//   • Activity is merged, never replaced.
export function mergeOntoServer(server, snapshot, patch, nowIso = new Date().toISOString()) {
  const eff = { ...patch };
  if (snapshot && eff.status === snapshot.status) delete eff.status;
  let conflict = false;
  if (snapshot && "status" in eff && server.status !== snapshot.status) {
    delete eff.status;
    conflict = true;
  }
  if (eff.activity) eff.activity = mergeActivity(server.activity, eff.activity);
  const next = withStatusHistory(
    server,
    reconcileJob(server, { ...server, ...eff, updatedAt: nowIso }, eff, new Date(nowIso)),
    nowIso
  );
  return { next, conflict };
}
