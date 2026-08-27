"use client";

// Authentication for LCL Ops — real per-user accounts via Supabase Auth.
// Each person signs in with their email + password and gets a real session
// (JWT). That session is what authorises database access (the database is
// locked to authenticated requests), so the data is not reachable without it.
//
// Roles live in the user's `app_metadata.role` ("admin" | "agent" | "engineer"),
// which is set by an admin at account-creation time and CANNOT be changed by
// the user.
//
// "engineer" is a stripped-down portal account: signing in lands them on
// /portal, where they see only their own jobs (matched by linking their login
// email to an Engineers record under Settings → Engineers).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { supabase, supabaseConfigured } from "./supabase";

// Permission map by role.
//
// Action-level sub-permissions (all false for agent by default):
//   importData    — import CSV or bulk-add records
//   deleteRecords — delete individual records or clear all
//   massActions   — bulk-select + bulk status-change / bulk delete
//   editStatus    — change a lead's pipeline stage (agents: outreach stages only; see UI guards)
export const PERMISSIONS = {
  admin: {
    dashboard: true,
    reports: true,
    expenses: true,
    settings: true,
    invoices: true,
    payments: true,
    bankDetails: true,
    manageClients: true,
    manageUsers: true,
    emailConfig: true,
    engineers: true,
    clients: true,
    prospects: true,
    agents: true,
    team: true,
    tasks: true,
    // Data-write actions — admin only
    importData: true,
    deleteRecords: true,
    massActions: true,
    editStatus: true,
  },
  agent: {
    dashboard: false,   // agents land on Dispatch, not Dashboard
    reports: false,
    // Separate from `reports` on purpose — an agent logging a parking
    // receipt or phone bill doesn't need to see company-wide revenue,
    // margins, or engineer pay. Off by default; an admin grants it per-user
    // in Settings → Users the same way any other permission is overridden.
    expenses: false,
    settings: false,
    invoices: false,
    payments: false,
    bankDetails: false,
    manageClients: false,
    manageUsers: false,
    emailConfig: false,
    engineers: false,
    clients: false,
    prospects: true,   // can view + do outreach
    agents: true,      // can view + do outreach
    team: true,        // needs access to Tasks (which lives under /team)
    tasks: true,
    // Data-write actions — all blocked for agents
    importData: false,
    deleteRecords: false,
    massActions: false,
    editStatus: false,
  },
  engineer: {
    dashboard: false,
    reports: false,
    expenses: false,
    settings: false,
    invoices: false,
    payments: false,
    bankDetails: false,
    manageClients: false,
    manageUsers: false,
    emailConfig: false,
    engineers: false,
    clients: false,
    prospects: false,
    agents: false,
    team: false,
    tasks: false,
    portal: true,
    importData: false,
    deleteRecords: false,
    massActions: false,
    editStatus: false,
  },
};

// Friendly labels + descriptions for the permission-management UI. The keys
// here must match the keys used in PERMISSIONS above.
export const PERMISSION_LABELS = {
  dashboard: { label: "Dashboard", desc: "View the main dashboard/overview." },
  reports: { label: "Reports & finance", desc: "View reports, revenue and finance summaries." },
  expenses: { label: "Company expenses", desc: "Log and view company expenses only — without seeing revenue, margins or engineer pay." },
  settings: { label: "Settings", desc: "Access the Settings area." },
  invoices: { label: "Invoices", desc: "View and manage invoices." },
  payments: { label: "Payments", desc: "View and record payments." },
  bankDetails: { label: "Bank details", desc: "View company bank account details." },
  manageClients: { label: "Manage clients", desc: "Add, edit or remove clients." },
  manageUsers: { label: "Manage users", desc: "Add, edit, remove users and set permissions." },
  emailConfig: { label: "Email configuration", desc: "View/edit email integration settings." },
  engineers: { label: "Engineers", desc: "View and manage the engineers list." },
  clients: { label: "Clients", desc: "View the clients section." },
  prospects: { label: "Prospects & cold leads", desc: "View prospects and cold leads outreach." },
  agents: { label: "Letting agents", desc: "View and manage the letting-agent B2B pipeline." },
  team: { label: "Team performance", desc: "View per-agent activity: calls and emails by section." },
  tasks: { label: "Tasks", desc: "Create, assign and track team to-dos and reminders." },
};

const AuthContext = createContext(null);

// Map a Supabase auth user to the app's user shape.
function toUser(u) {
  if (!u) return null;
  const rawRole = u.app_metadata?.role;
  const role = rawRole === "admin" ? "admin" : rawRole === "engineer" ? "engineer" : "agent";
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || u.email,
    username: u.user_metadata?.username || "",
    avatarUrl: u.user_metadata?.avatar_url || u.user_metadata?.picture || "",
    role,
    // Per-user permission overrides (set by an admin), e.g. { reports: true }.
    // Any key not present here falls back to the role default below.
    permissions: u.user_metadata?.permissions || {},
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    let active = true;

    // getSession() reads the LOCALLY CACHED session. Permissions live in
    // user_metadata, which is baked into the JWT at sign-in — so an admin
    // granting someone access changes nothing for that user until their
    // token refreshes (up to an hour) or they sign out and back in. From
    // their side it looks exactly like the grant never happened.
    //
    // getUser() does a real round-trip and returns current metadata, so a
    // permission change lands within seconds. Session first (instant paint,
    // works offline), then the authoritative copy over the top.
    const refreshFromServer = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active || error || !data?.user) return;
        setUser((prev) => {
          const next = toUser(data.user);
          // Only re-set state when something actually changed, so this can
          // run on every refocus without re-rendering the whole app.
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      } catch {
        /* offline or transient — the cached session stays in effect */
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(toUser(data.session?.user));
      setReady(true);
      if (data.session) refreshFromServer();
    });

    // Re-check when the tab/app is brought back into focus, so a permission
    // change made while they were away applies as soon as they return.
    const onFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshFromServer();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
      // The cross-device prefs cache belongs to whichever user was signed in.
      // Blow it away so the next per-page mount re-fetches from metadata.
      import("./userPrefs").then((m) => m.resetCache()).catch(() => {});
    });
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (identifier, password) => {
    if (!supabaseConfigured) {
      return { ok: false, error: "Backend not configured." };
    }
    let email = (identifier || "").trim();
    // If they typed a username (no "@"), resolve it to an email first.
    if (email && !email.includes("@")) {
      try {
        const res = await fetch("/api/auth/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: email }),
        });
        const out = await res.json().catch(() => ({}));
        if (res.ok && out.email) {
          email = out.email;
        } else {
          return { ok: false, error: "Username not found. Try your email instead." };
        }
      } catch {
        return { ok: false, error: "Could not look up that username." };
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: error.message || "Incorrect username or password." };
    }
    return { ok: true };
  }, []);

  // Update YOUR OWN display name / username metadata.
  const updateOwnProfile = useCallback(async (patch) => {
    if (!supabaseConfigured) return { ok: false, error: "Backend not configured." };
    const { error } = await supabase.auth.updateUser({ data: patch });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { ok: false, error: "Backend not configured." };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" }, // always show account picker
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (supabaseConfigured) {
      // Revoking the session server-side needs a network round trip. On a
      // broken connection or dead session that call can hang indefinitely,
      // and with nothing after it in this function, the user is stuck
      // looking "signed in" with no way out. Race it against a timeout so
      // local sign-out always completes either way.
      await Promise.race([
        supabase.auth.signOut().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    setUser(null);
  }, []);

  // Change YOUR OWN password (admins manage other users in the Supabase
  // dashboard for now).
  const changeOwnPassword = useCallback(async (newPassword) => {
    if (!supabaseConfigured) return { ok: false, error: "Backend not configured." };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const can = useCallback(
    (perm) => {
      if (!user) return false;
      const override = user.permissions?.[perm];
      if (typeof override === "boolean") return override;
      return Boolean(PERMISSIONS[user.role]?.[perm]);
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin: user?.role === "admin",
      login,
      loginWithGoogle,
      logout,
      changeOwnPassword,
      updateOwnProfile,
      can,
    }),
    [user, ready, login, loginWithGoogle, logout, changeOwnPassword, updateOwnProfile, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
