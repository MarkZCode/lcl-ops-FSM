"use client";

// Engineer scoping: an agent/engineer login sees only their own jobs. We link a
// login to an engineer record by matching the login email to the engineer's
// email. Admins (and agents with no matching engineer record) see everything.
import { useAuth } from "./auth";
import { useStore } from "./store";

export function jobBelongsToEngineer(job, engId) {
  if (!engId) return true; // not scoped → see all
  if (job.engineerId === engId) return true;
  return (
    Array.isArray(job.lineItems) &&
    job.lineItems.some((l) => l.engineerId === engId)
  );
}

// Returns the current user's engineer id if they're a scoped engineer, else null
// (admins, or agents whose login email doesn't match an engineer record).
export function useMyEngineerId() {
  const { user, isAdmin } = useAuth();
  const { engineers } = useStore();
  if (isAdmin || !user?.email) return null;
  const mine = engineers.find(
    (e) => e.email && e.email.toLowerCase() === user.email.toLowerCase()
  );
  return mine ? mine.id : null;
}
