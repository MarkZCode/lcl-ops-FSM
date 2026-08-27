"use client";

import { supabase } from "./supabase";

// Upload a File through the server (which stores it in Supabase Storage and
// returns a public URL). If that fails, falls back to an inline base64 data URL
// so uploads never hard-break.

async function authHeader() {
  try {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Returns { name, type, size, url, path } on success, or { ..., dataUrl } fallback.
export async function uploadFile(file, folder = "jobs") {
  const base64 = await fileToBase64(file);
  try {
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        base64,
        filename: file.name,
        contentType: file.type,
        folder,
      }),
    });
    if (res.ok) {
      const { url, path } = await res.json();
      return { name: file.name, type: file.type, size: file.size, url, path };
    }
  } catch {
    // fall through to inline fallback
  }
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: `data:${file.type || "application/octet-stream"};base64,${base64}`,
  };
}

export async function removeFile(path) {
  if (!path) return;
  try {
    await fetch("/api/storage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ path }),
    });
  } catch {
    // best-effort
  }
}

// Resolve the viewable/downloadable URL for a stored file (Storage URL or the
// inline data URL fallback).
export function fileSrc(f) {
  return f?.url || f?.dataUrl || "";
}

// ── Client-side image downscaling ────────────────────────────────────────
//
// A photo straight off a phone is 3–12 MP and 2–5 MB. Base64 inflates it by
// another third, so "upload a profile picture" was POSTing a ~4 MB JSON body
// and then waiting on Supabase Storage to accept it — the spinner that never
// seemed to finish. An avatar is rendered at 80px. Shrinking it to 512px JPEG
// in the browser first turns that 4 MB body into ~40 KB, which uploads
// instantly and looks identical at every size we display it.
//
// Returns { base64, contentType, ext }. Falls back to the untouched file if
// the browser can't decode it (SVG, HEIC without support, canvas blocked),
// so an odd format still uploads rather than failing outright.
export async function downscaleImage(file, { max = 512, quality = 0.82 } = {}) {
  // `converted: false` means the bytes are the ORIGINAL file — the browser
  // couldn't decode it. Callers that need a displayable image (avatars) check
  // this rather than silently storing something no <img> can render.
  const raw = async () => ({
    base64: await fileToBase64(file),
    contentType: file.type || "application/octet-stream",
    ext: (file.name.split(".").pop() || "jpg").toLowerCase(),
    converted: false,
  });

  if (typeof document === "undefined" || !file?.type?.startsWith("image/")) return raw();
  // Already small and already web-safe — re-encoding would only lose quality.
  if (file.size < 120 * 1024 && /jpeg|jpg|png|webp/.test(file.type)) {
    return { ...(await raw()), converted: true };
  }

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Transparency flattens to white — a JPEG has no alpha channel, and an
    // un-flattened one renders the transparent areas black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1];
    if (!base64) return raw();
    return { base64, contentType: "image/jpeg", ext: "jpg", converted: true };
  } catch {
    return raw();
  }
}

function loadBitmap(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  // Safari fallback — object URL into an <img>, revoked either way so the
  // blob doesn't leak for the life of the page.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
