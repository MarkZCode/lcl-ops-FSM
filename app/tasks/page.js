"use client";

// The old /tasks route was folded into /team (Board tab). This shim exists
// so any bookmarks, old push-notification URLs, or in-app links pointing at
// /tasks land on the same board without a 404.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TasksRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/team?tab=board"); }, [router]);
  return null;
}
