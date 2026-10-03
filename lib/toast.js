"use client";

// Tiny global toast. Call toast("Saved") from anywhere (components or the store)
// and the <Toaster/> mounted in the app shows a brief confirmation.
export function toast(message, type = "success", extra = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lcl-toast", {
      detail: { message, type, id: Date.now() + Math.random(), ...extra },
    })
  );
}

// Convenience helpers so `toast.success(...)` / `toast.error(...)` also work.
toast.success = (message) => toast(message, "success");
toast.error = (message) => toast(message, "error");

// "Done · Undo" — stays up for 8 seconds with a button that reverses it.
toast.undo = (message, onUndo) => toast(message, "success", { action: { label: "Undo", run: onUndo }, duration: 8000 });
