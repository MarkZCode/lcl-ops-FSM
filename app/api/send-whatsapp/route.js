// Send WhatsApp messages via the Meta WhatsApp Cloud API.
// Server-side only — the token lives in env, never the browser.
//
//   WHATSAPP_TOKEN            = a (permanent System User) access token
//   WHATSAPP_PHONE_NUMBER_ID  = the Phone Number ID from Meta
//
// NOTE on WhatsApp rules: free-form text only reaches a user who messaged you in
// the last 24h. To start a conversation (quotes, reminders) you must send an
// APPROVED TEMPLATE — pass { template: { name, lang, components } }.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(`send-wa:${user.id}`, LIMITS.sendWhatsApp);
  if (limited) return limited;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { to, text, template } = body || {};
  if (!to || (!text && !template)) {
    return NextResponse.json({ error: "Missing 'to' and message" }, { status: 400 });
  }

  const payload = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.lang || "en" },
          ...(template.components ? { components: template.components } : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      };

  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "WhatsApp send failed (a template is required to start a new conversation).",
          details: data,
        },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, id: data?.messages?.[0]?.id });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach WhatsApp.", details: String(err?.message || err) },
      { status: 502 }
    );
  }
}
