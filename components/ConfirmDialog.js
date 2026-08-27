"use client";

import Modal from "./Modal";

// In-app replacement for window.confirm().
//
// The native dialog is rendered by the browser, not the app: it lands
// centred over everything with OS chrome, its own fonts and an
// "lcl-ops.vercel.app says" header. On top of a modal it reads like an error
// rather than a question, and it can't be styled at all.
//
// Deliberately small — a question, two buttons, nothing else.
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  body,
  confirmLabel = "Discard",
  cancelLabel = "Keep editing",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn-outline" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <p className="text-sm text-navy-600">{body}</p>}
    </Modal>
  );
}
