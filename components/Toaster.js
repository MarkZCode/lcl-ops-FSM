"use client";

import { useEffect, useState } from "react";
import { FiCheckCircle, FiTrash2, FiInfo } from "react-icons/fi";

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setToasts((prev) => [...prev.slice(-2), t]); // keep at most 3
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, t.duration || 2400);
    };
    window.addEventListener("lcl-toast", onToast);
    return () => window.removeEventListener("lcl-toast", onToast);
  }, []);

  if (!toasts.length) return null;

  const icon = (type) =>
    type === "delete" ? (
      <FiTrash2 className="text-rose-400" />
    ) : type === "info" ? (
      <FiInfo className="text-blue-300" />
    ) : (
      <FiCheckCircle className="text-brand-400" />
    );

  return (
    <div className="pointer-events-none fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-[55] flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-2xl animate-fade-in"
        >
          {icon(t.type)} {t.message}
          {t.action && (
            <button
              type="button"
              className="pointer-events-auto ml-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25"
              onClick={() => { t.action.run?.(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
