// Wait for some background work, but never longer than `ms`. Used where a
// client or engineer is staring at a "Saving…" button: the task list update
// after their action is useful but not worth making them wait for — if it
// runs long, the next regular sync (every few minutes while the office app
// is open) finishes the job.
export function within(promise, ms = 1500) {
  return Promise.race([
    Promise.resolve(promise).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}
