"use client";

import { createContext, useCallback, useContext, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// Promise-based replacement for window.confirm().
//
// Mounted once at the app root. `useConfirm()` returns an async function, so a
// call site reads almost identically to the native version it replaces:
//
//     if (!(await ask({ body: "Delete this?" }))) return;
//
// That matters — there are ~25 of these across the app, and anything needing
// its own useState per call site would have been rewritten badly or not at all.
//
// Resolves false on cancel/backdrop/Escape, so dismissing is always the safe
// outcome and a stray keypress can never confirm a destructive action.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);

  const ask = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        setReq({
          title: "Are you sure?",
          confirmLabel: "Confirm",
          cancelLabel: "Cancel",
          tone: "danger",
          ...(typeof opts === "string" ? { body: opts } : opts),
          resolve,
        });
      }),
    []
  );

  const settle = (value) => {
    setReq((cur) => {
      cur?.resolve?.(value);
      return null;
    });
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog
        open={!!req}
        title={req?.title}
        body={req?.body}
        confirmLabel={req?.confirmLabel}
        cancelLabel={req?.cancelLabel}
        tone={req?.tone}
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  // Falling back to window.confirm keeps any component rendered outside the
  // provider working rather than crashing on a missing context.
  return ask || ((opts) => Promise.resolve(window.confirm(typeof opts === "string" ? opts : opts?.body || "Are you sure?")));
}
