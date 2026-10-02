"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FiShield,
  FiUser,
  FiKey,
  FiUserPlus,
  FiTrash2,
  FiCheckCircle,
  FiLoader,
  FiEdit2,
  FiCamera,
  FiSliders,
} from "react-icons/fi";
import { FaHardHat } from "react-icons/fa";
import { useAuth, PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { downscaleImage } from "@/lib/uploads";
import Modal from "./Modal";
import { useConfirm } from "@/components/ConfirmProvider";

async function authedFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || "";
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

const emptyForm = { name: "", username: "", email: "", password: "", role: "agent" };

function AvatarPicker({ currentUrl, userId, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(currentUrl || "");

  // Show the picked image the instant it's chosen, and upload the shrunken
  // copy in the background. The old flow read the whole full-resolution file
  // into base64 and POSTed several megabytes before anything appeared on
  // screen, so a normal phone photo looked like it had hung.
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a failure
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert("That image is too large — pick one under 12 MB."); return; }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);

    // Every path out of here must clear `busy`. The original version set it
    // before a FileReader that had no onerror handler, so any file the reader
    // couldn't decode (a HEIC straight off an iPhone, most often) left the
    // spinner turning for ever with no error and no way to retry.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 45000);
    try {
      const { base64, contentType, ext, converted } = await downscaleImage(file, { max: 512 });

      // A format the browser couldn't decode AND can't display: uploading it
      // raw would "succeed" and leave a permanently broken avatar. Say so.
      if (!converted && !/jpeg|jpg|png|webp|gif/i.test(contentType)) {
        alert(
          "This image format can't be used for a profile picture" +
          (/heic|heif/i.test(contentType) ? " (iPhone HEIC)." : ".") +
          " Screenshot it, or save it as JPEG or PNG, and try again."
        );
        setPreview(currentUrl || "");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || "";
      const res = await fetch("/api/storage", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filename: `avatar-${userId}-${Date.now()}.${ext}`,
          folder: "avatars",
          base64,
          contentType,
        }),
      });
      if (res.ok) {
        const { url } = await res.json();
        setPreview(url);
        onSaved(url);
      } else {
        const d = await res.json().catch(() => ({}));
        setPreview(currentUrl || "");
        alert(
          d.notConfigured
            ? "File storage isn't configured on the server, so pictures can't be uploaded yet."
            : d.error || `Upload failed (${res.status}). Try again.`
        );
      }
    } catch (err) {
      setPreview(currentUrl || "");
      alert(
        err.name === "AbortError"
          ? "Upload timed out after 45s — check your connection and try again."
          : "Upload error: " + err.message
      );
    } finally {
      clearTimeout(timer);
      URL.revokeObjectURL(localUrl);
      setBusy(false);
    }
  };

  const initials = "👤";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {preview ? (
          <img src={preview} alt="Avatar" className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-300" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-brand-500 text-2xl font-bold text-white">
            {initials}
          </div>
        )}
        <label className="absolute bottom-0 right-0 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white shadow ring-1 ring-navy-200 hover:bg-brand-50">
          {busy ? <FiLoader className="h-3.5 w-3.5 animate-spin text-navy-500" /> : <FiCamera className="h-3.5 w-3.5 text-navy-600" />}
          <input type="file" accept="image/*" className="sr-only" onChange={handleFile} disabled={busy} />
        </label>
      </div>
      <p className="text-[11px] text-navy-400">Click camera to upload (resized automatically)</p>
    </div>
  );
}

export default function UserManagement() {
  const ask = useConfirm();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pwUser, setPwUser] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [editUser, setEditUser] = useState(null); // { id, name, username, avatarUrl }
  const [permUser, setPermUser] = useState(null); // { id, name, role, overrides }
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/admin/users");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setUsers(data.users || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  };

  const addUser = async () => {
    setError("");
    if (!form.email.trim() || !form.password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    const res = await authedFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not create user.");
      return;
    }
    setForm(emptyForm);
    setAddOpen(false);
    flash("User created.");
    load();
  };

  const delUser = async (u) => {
    if (!await ask(`Remove ${u.name || u.email}? They'll lose access immediately.`))
      return;
    const res = await authedFetch("/api/admin/users", {
      method: "DELETE",
      body: JSON.stringify({ id: u.id }),
    });
    if (res.ok) {
      flash("User removed.");
      load();
    }
  };

  const saveProfile = async () => {
    setError("");
    setBusy(true);
    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({
        id: editUser.id,
        name: editUser.name,
        username: editUser.username,
        avatar_url: editUser.avatarUrl,
        away_until: editUser.awayUntil || "",
      }),
    });
    setBusy(false);
    if (res.ok) {
      // If the admin just edited their OWN profile, the active session's
      // cached metadata (name/username/avatar shown in the sidebar) won't
      // reflect the change until the session refreshes — do that now so it
      // updates immediately instead of waiting for the next sign-in.
      if (editUser.id === user?.id) {
        await supabase.auth.refreshSession();
      }
      setEditUser(null);
      flash("Profile updated.");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update profile.");
    }
  };

  const savePermissions = async () => {
    setError("");
    setBusy(true);
    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id: permUser.id, permissions: permUser.overrides }),
    });
    setBusy(false);
    if (res.ok) {
      if (permUser.id === user?.id) {
        await supabase.auth.refreshSession();
      }
      setPermUser(null);
      flash("Permissions updated.");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update permissions.");
    }
  };

  const savePw = async () => {
    setError("");
    if (newPw.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id: pwUser.id, password: newPw }),
    });
    setBusy(false);
    if (res.ok) {
      setPwUser(null);
      setNewPw("");
      flash("Password updated.");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update password.");
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-label text-sm">
          Users &amp; access
        </h2>
        <button
          className="btn-outline py-1.5 text-xs"
          onClick={() => {
            setForm(emptyForm);
            setError("");
            setAddOpen(true);
          }}
        >
          <FiUserPlus /> Add user
        </button>
      </div>

      <div className="card divide-y divide-navy-100">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-navy-400">
            <FiLoader className="animate-spin" /> Loading users…
          </p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-navy-400">No users found.</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={u.name || ""} className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-brand-200" />
                ) : (
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${u.role === "admin" ? "bg-navy-800" : u.role === "engineer" ? "bg-amber-500" : "bg-brand-500"}`}>
                    {u.role === "admin" ? <FiShield /> : u.role === "engineer" ? <FaHardHat /> : <FiUser />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900">
                    {u.name}
                    {u.id === user?.id && (
                      <span className="ml-2 text-[11px] font-normal text-navy-400">
                        (you)
                      </span>
                    )}
                    {u.is_super_admin && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        <FiShield className="h-2.5 w-2.5" /> Root admin
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-navy-500">
                    {u.username ? `@${u.username} · ` : ""}{u.email}
                  </p>
                  <p className="text-xs capitalize text-navy-400">
                    {u.role === "admin" ? "Administrator" : u.role === "engineer" ? "Engineer (Portal only)" : "Engineer / Agent"}
                    {u.away_until && u.away_until >= new Date().toISOString().slice(0, 10) ? ` · away until ${u.away_until}` : ""}
                  </p>
                </div>
              </div>
              {(() => {
                // The root admin can only be edited/deleted by themselves.
                // For everyone else, hide the actions entirely so other admins
                // can't even try (the API also enforces this).
                const canModify = !u.is_super_admin || u.id === user?.id;
                if (!canModify) {
                  return (
                    <div className="text-xs italic text-navy-400 sm:ml-auto">
                      Protected — only the root admin can change this account.
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:shrink-0 sm:flex-nowrap sm:items-center">
                    <button
                      onClick={() => {
                        setEditUser({ id: u.id, name: u.name || "", username: u.username || "", avatarUrl: u.avatar_url || "", awayUntil: u.away_until || "" });
                        setError("");
                      }}
                      className="btn-outline justify-center py-1.5 text-xs sm:flex-initial"
                    >
                      <FiEdit2 /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setPermUser({ id: u.id, name: u.name || u.email, role: u.role, overrides: { ...(u.permissions || {}) } });
                        setError("");
                      }}
                      className="btn-outline justify-center py-1.5 text-xs sm:flex-initial"
                    >
                      <FiSliders /> Access
                    </button>
                    <button
                      onClick={() => {
                        setPwUser(u);
                        setNewPw("");
                        setError("");
                      }}
                      className="btn-outline justify-center py-1.5 text-xs sm:flex-initial"
                    >
                      <FiKey /> Password
                    </button>
                    {u.id !== user?.id && !u.is_super_admin && (
                      <button
                        onClick={() => delUser(u)}
                        className="btn-outline justify-center py-1.5 text-xs text-rose-500 hover:bg-rose-50 sm:h-8 sm:w-8 sm:flex-none sm:p-0"
                        title="Remove user"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                        <span className="sm:hidden">Remove</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ))
        )}
      </div>

      {msg && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
          <FiCheckCircle /> {msg}
        </p>
      )}
      <p className="mt-2 text-xs text-navy-400">
        Users can sign in with their <strong>username</strong> (e.g. “mark”) or their
        email. Admins see everything; agents see Dispatch, Jobs and Clients —
        not Reports, Invoices, bank details or Settings. <strong>Engineer (Portal
        only)</strong> accounts land on a simple &ldquo;My Jobs&rdquo; portal showing just their
        own schedule. For an agent or engineer to see only <em>their own</em> jobs,
        use the <strong>same email</strong> for their login and their record under
        Engineers below.
      </p>

      {/* Add user */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add user"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={addUser} disabled={busy}>
              {busy ? <FiLoader className="animate-spin" /> : <FiUserPlus />} Create user
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. James Okafor"
              />
            </div>
            <div>
              <label className="label">Username (login)</label>
              <input
                className="input"
                value={form.username}
                autoCapitalize="none"
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="e.g. james"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option value="agent">Agent (full app, own jobs)</option>
                <option value="engineer">Engineer (Portal only)</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Starting password</label>
            <input
              type="text"
              className="input"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 6 characters"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>

      {/* Edit name + username */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Edit profile"
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditUser(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={saveProfile} disabled={busy}>
              {busy ? <FiLoader className="animate-spin" /> : <FiCheckCircle />} Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {editUser && (
            <AvatarPicker
              currentUrl={editUser.avatarUrl}
              userId={editUser.id}
              onSaved={(url) => setEditUser((u) => ({ ...u, avatarUrl: url }))}
            />
          )}
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              value={editUser?.name || ""}
              onChange={(e) => setEditUser((u) => ({ ...u, name: e.target.value }))}
              placeholder="e.g. Mark Taylor"
            />
          </div>
          <div>
            <label className="label">Username (login)</label>
            <input
              className="input"
              autoCapitalize="none"
              value={editUser?.username || ""}
              onChange={(e) => setEditUser((u) => ({ ...u, username: e.target.value }))}
              placeholder="e.g. mark"
            />
            <p className="mt-1 text-[11px] text-navy-400">
              They can sign in with this username or their email.
            </p>
          </div>
          <div>
            <label className="label">Away until</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="input"
                value={editUser?.awayUntil || ""}
                onChange={(e) => setEditUser((u) => ({ ...u, awayUntil: e.target.value }))}
              />
              {editUser?.awayUntil && (
                <button type="button" className="btn-outline shrink-0" onClick={() => setEditUser((u) => ({ ...u, awayUntil: "" }))}>Back in</button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-navy-400">
              While away, no new tasks are given to them. Leave empty if they&apos;re in.
            </p>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>

      {/* Manage permissions */}
      <Modal
        open={!!permUser}
        onClose={() => setPermUser(null)}
        title={permUser ? `Access — ${permUser.name}` : ""}
        wide
        footer={
          <>
            <button className="btn-outline" onClick={() => setPermUser(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={savePermissions} disabled={busy}>
              {busy ? <FiLoader className="animate-spin" /> : <FiCheckCircle />} Save
            </button>
          </>
        }
      >
        {permUser && (
          <div className="space-y-3">
            <p className="text-xs text-navy-500">
              By default, access follows their role (
              <strong className="capitalize">{permUser.role === "admin" ? "Administrator" : permUser.role === "engineer" ? "Engineer (Portal only)" : "Engineer / Agent"}</strong>
              ). Override individual sections below to grant or restrict access for this person specifically.
              Changes apply next time they sign in or refresh the app.
            </p>
            <div className="divide-y divide-navy-100 rounded-xl border border-navy-100">
              {Object.keys(PERMISSIONS.admin).map((key) => {
                const roleDefault = Boolean(PERMISSIONS[permUser.role]?.[key]);
                const override = permUser.overrides?.[key];
                const value = override === true ? "allow" : override === false ? "deny" : "default";
                const meta = PERMISSION_LABELS[key] || { label: key, desc: "" };
                return (
                  <div key={key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">{meta.label}</p>
                      {meta.desc && <p className="text-xs text-navy-400">{meta.desc}</p>}
                    </div>
                    <select
                      className="input w-full py-1.5 text-xs sm:w-48"
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPermUser((p) => {
                          const next = { ...(p.overrides || {}) };
                          if (v === "default") delete next[key];
                          else next[key] = v === "allow";
                          return { ...p, overrides: next };
                        });
                      }}
                    >
                      <option value="default">Default ({roleDefault ? "allowed" : "blocked"})</option>
                      <option value="allow">Always allow</option>
                      <option value="deny">Always block</option>
                    </select>
                  </div>
                );
              })}
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title={pwUser ? `Set password — ${pwUser.name}` : ""}
        footer={
          <>
            <button className="btn-outline" onClick={() => setPwUser(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={savePw} disabled={busy}>
              Save password
            </button>
          </>
        }
      >
        <label className="label">New password</label>
        <input
          type="text"
          className="input"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="At least 6 characters"
        />
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </Modal>
    </section>
  );
}
