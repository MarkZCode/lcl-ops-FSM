// Called client-side right after a successful Supabase login.
// Reads the caller's IP, compares against known IPs stored in user_metadata.
// If it's a new IP → sends a security alert email via Gmail and saves the IP.
// No login block — just a notification (blocking would risk locking the user out).
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import nodemailer from "nodemailer";

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function getIP(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function sendAlertEmail({ to, name, ip, time }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return Promise.resolve();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter.sendMail({
    from: `"LCL Ops Security" <${user}>`,
    to,
    subject: "New sign-in detected — LCL Ops",
    html: `
      <p>Hi ${escapeHtml(name || "there")},</p>
      <p>We noticed a new sign-in to your <strong>LCL Ops</strong> account from a device or location we haven't seen before.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">IP address</td><td style="font-weight:600">${escapeHtml(ip)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Time</td><td style="font-weight:600">${escapeHtml(time)}</td></tr>
      </table>
      <p>If this was you, no action is needed.</p>
      <p>If you didn't sign in, change your password immediately in <strong>Settings → Users &amp; access</strong>.</p>
      <p style="color:#999;font-size:12px">— LCL Ops · Landlord Compliance London</p>
    `,
  });
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: true }); // no-op without admin

  const caller = await requireUser(request);
  if (!caller) return NextResponse.json({ ok: true }); // not signed in — skip

  const ip = getIP(request);
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });

  // Fetch the full user record so we can read + update user_metadata
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(caller.id);
  if (error || !userData?.user) return NextResponse.json({ ok: true });

  const meta = userData.user.user_metadata || {};
  const knownIPs = Array.isArray(meta.known_ips) ? meta.known_ips : [];

  if (!knownIPs.includes(ip)) {
    // New IP — save it and send alert
    const updatedIPs = [...knownIPs, ip].slice(-20); // keep last 20
    await supabaseAdmin.auth.admin.updateUserById(caller.id, {
      user_metadata: { ...meta, known_ips: updatedIPs },
    });

    // Send alert to the user's own email
    try {
      await sendAlertEmail({
        to: userData.user.email,
        name: meta.name || userData.user.email,
        ip,
        time,
      });
    } catch (e) {
      console.error("[check-ip] email failed:", e.message);
    }

    return NextResponse.json({ ok: true, newIp: true });
  }

  return NextResponse.json({ ok: true, newIp: false });
}
