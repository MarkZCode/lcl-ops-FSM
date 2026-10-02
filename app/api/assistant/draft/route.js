// Draft a client message for a job, written under LCL's own rules
// (lib/assistantContext.js) from the live job record the browser sends.
//
// Nothing is sent to the client from here — it returns text for a person to
// read, edit and send. Does nothing until ANTHROPIC_API_KEY is set on the
// server: it answers { notConfigured: true } and the button says so.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429 } from "@/lib/rateLimit";
import { ASSISTANT_SYSTEM } from "@/lib/assistantContext";

export const runtime = "nodejs";
export const maxDuration = 60;

const cap = (v, n) => String(v ?? "").slice(0, n);

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const limited = rateLimitOr429(`assistant:${user.id}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  let body = {};
  try { body = await request.json(); } catch {}
  const channel = body.channel === "email" ? "email" : "whatsapp";
  const ask = cap(body.ask, 2000).trim();
  if (!ask) return NextResponse.json({ error: "Say what the message should do, or paste the client's message." }, { status: 400 });
  // The record is built by the app from the job; bounded here so a huge
  // thread can't be posted through.
  const record = cap(typeof body.record === "string" ? body.record : JSON.stringify(body.record || {}, null, 1), 12000);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Short messages from a short record: low effort is plenty and keeps
      // the wait to a few seconds.
      output_config: { effort: "low" },
      // If the request is declined, let the API retry on its default
      // fallback model rather than failing the draft.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The rules never change between requests, so they cache.
      system: [{ type: "text", text: ASSISTANT_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content:
          `Channel: ${channel === "email" ? "Email" : "WhatsApp"}\n` +
          `Sign off as: ${cap(body.sender, 40) || "Lisa"}\n\n` +
          `LIVE JOB RECORD (the only facts you may rely on):\n${record}\n\n` +
          `WHAT THE STAFF MEMBER NEEDS:\n${ask}`,
      }],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The assistant declined to draft that. Write this one by hand." }, { status: 422 });
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) return NextResponse.json({ error: "No draft came back — try again." }, { status: 502 });
    return NextResponse.json({ ok: true, text });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "The assistant's API key isn't valid." }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "The assistant is busy — try again in a minute." }, { status: 429 });
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: `The assistant couldn't draft that (${error.status}).` }, { status: 502 });
    return NextResponse.json({ error: "The assistant couldn't be reached." }, { status: 502 });
  }
}
