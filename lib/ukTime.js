// The business runs on UK clock time (Europe/London), but the app is used
// from devices set to other timezones (confirmed: Pakistan, UTC+5). Every
// prior "new Date(`${date}T${time}`)" construction was parsed in whatever
// timezone the DEVICE happened to be set to, not the business's timezone —
// so typing "15:00" on a Pakistan-timezone device silently stored 15:00 PKT
// (10:00 UTC / 11:00 UK) instead of the intended 15:00 UK (14:00 UTC).
// That drift is what caused a 3pm-6pm UK visit to read as already overdue
// hours early. Use these helpers anywhere a UK wall-clock date+time needs
// to become an absolute instant, instead of the bare Date constructor.

// Converts a UK wall-clock date+time (as typed by a UK-based user, e.g.
// "2026-09-10" + "15:00") into the correct UTC instant, regardless of the
// runtime's local timezone. Handles GMT/BST automatically.
export function ukDateTimeToUtcIso(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || "09:00";
  // Start from a naive UTC guess, then measure how far Europe/London's wall
  // clock is from that guess at that instant, and correct by the difference.
  const naiveUtc = new Date(`${dateStr}T${time}:00.000Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(naiveUtc).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtcAgain = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = asUtcAgain - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs).toISOString();
}

// True if the given ISO instant has passed, i.e. it is now on or after the
// wall-clock date+time the instant represents. Comparing epoch ms is always
// timezone-agnostic once you HAVE a correct instant — the danger is only in
// how that instant was produced. This helper exists so call sites reach for
// it instead of re-deriving `.getTime()` comparisons inline.
export function hasPassed(isoInstant, now = new Date()) {
  if (!isoInstant) return false;
  return new Date(isoInstant).getTime() <= now.getTime();
}
