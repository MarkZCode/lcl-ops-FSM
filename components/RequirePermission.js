"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// Page-level guard. Agents are silently redirected to /dispatch.
// Admins and authorised users see the content normally.
// `perm` — a single required permission (existing usage, unchanged).
// `anyOf` — an array; access granted if the user has ANY one of these (e.g.
// Reports is normally gated on "reports", but a user granted only the
// narrower "expenses" permission should still get in, just to a restricted
// view the page itself renders based on which permission they actually have).
export default function RequirePermission({ perm, anyOf, children }) {
  const { can, ready, user } = useAuth();
  const router = useRouter();
  const allowed = anyOf ? anyOf.some((p) => can(p)) : can(perm);

  useEffect(() => {
    if (ready && user && !allowed) {
      router.replace("/dispatch");
    }
  }, [ready, user, allowed, router]);

  if (!ready) return null;
  if (!user) return null;
  if (!allowed) return null; // will redirect via effect

  return children;
}
