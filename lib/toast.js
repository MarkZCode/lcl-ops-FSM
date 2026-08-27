"use client";

// Tiny global toast. Call toast("Saved") from anywhere (components or the store)
// and the <Toaster/> mounted in the app shows a brief confirmation.
export function toast(message, type = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lcl-toast", {
      detail: { message, type, id: Date.now() + Math.random() },
    })
  );
}

// Convenience helpers so `toast.success(...)` / `toast.error(...)` also work.
toast.success = (message) => toast(message, "success");
toast.error = (message) => toast(message, "error");
