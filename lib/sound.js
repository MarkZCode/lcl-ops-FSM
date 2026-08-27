"use client";

// A reliable notification chime. Browsers block audio until the user interacts
// with the page, so we keep ONE AudioContext and unlock it on the first click /
// keypress / touch anywhere in the app. After that, playPing() always works.

let ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

if (typeof window !== "undefined") {
  const unlock = () => getCtx();
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

export function playPing() {
  const c = getCtx();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, c.currentTime);
    o.frequency.setValueAtTime(1175, c.currentTime + 0.13);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.32, c.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45);
    o.start();
    o.stop(c.currentTime + 0.45);
  } catch {
    /* ignore */
  }
}
