"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiCheckCircle, FiAlertCircle } from "react-icons/fi";

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) return;
    setState("loading");
    fetch(`/api/track/unsub?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setState("done"); setEmail(d.email || ""); }
        else setState("error");
      })
      .catch(() => setState("error"));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-xl">
        {state === "loading" && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-navy-600" />
            <p className="text-navy-600">Processing…</p>
          </>
        )}
        {state === "done" && (
          <>
            <FiCheckCircle className="mx-auto mb-4 h-12 w-12 text-brand-500" />
            <h1 className="mb-2 text-xl font-bold text-navy-900">You&rsquo;ve been unsubscribed</h1>
            {email && <p className="mb-4 text-sm text-navy-500">{email}</p>}
            <p className="text-sm text-navy-600">
              You won&rsquo;t receive any more emails from Landlord Compliance London. If this was a mistake, please contact us directly.
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <FiAlertCircle className="mx-auto mb-4 h-12 w-12 text-rose-500" />
            <h1 className="mb-2 text-xl font-bold text-navy-900">Something went wrong</h1>
            <p className="text-sm text-navy-600">
              We couldn&rsquo;t process your unsubscribe request. Please reply to the email you received and ask to be removed.
            </p>
          </>
        )}
        {state === "idle" && !token && (
          <>
            <FiAlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h1 className="mb-2 text-xl font-bold text-navy-900">Invalid link</h1>
            <p className="text-sm text-navy-600">This unsubscribe link is missing its token. Please use the link from the original email.</p>
          </>
        )}
        <p className="mt-8 text-xs text-navy-400">Landlord Compliance London · 07426 409342</p>
      </div>
    </div>
  );
}
