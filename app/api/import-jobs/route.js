// Bulk import of jobs + clients from the in-app CSV import flow.
// Admin-only (importing arbitrary jobs would otherwise let any anonymous
// caller poison the DB). Rate-limited so a logged-in admin can't accidentally
// (or maliciously) wedge the database with a runaway loop.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const MAX_ROWS = 5000;          // upper bound per request
const MAX_ID_LENGTH = 80;

const isValidId = (id) =>
  typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH;

export async function POST(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = rateLimitOr429(`import:${admin.id}`, LIMITS.import);
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { jobs, clients } = body || {};

  if (!Array.isArray(jobs) || !Array.isArray(clients)) {
    return NextResponse.json(
      { error: "Invalid data format. Expected { jobs, clients }" },
      { status: 400 }
    );
  }
  if (jobs.length > MAX_ROWS || clients.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows. Max ${MAX_ROWS} per request.` },
      { status: 413 }
    );
  }

  const validClients = clients.filter((c) => c && isValidId(c.id));
  const validJobs = jobs.filter((j) => j && isValidId(j.id));

  try {
    if (validClients.length) {
      const clientOps = validClients.map((c) => ({ id: c.id, data: c }));
      const { error: clientError } = await supabaseAdmin
        .from("clients")
        .upsert(clientOps);
      if (clientError) {
        return NextResponse.json(
          { error: `Failed to import clients: ${clientError.message}` },
          { status: 500 }
        );
      }
    }

    if (validJobs.length) {
      const jobOps = validJobs.map((j) => ({ id: j.id, data: j }));
      const { error: jobError } = await supabaseAdmin.from("jobs").upsert(jobOps);
      if (jobError) {
        return NextResponse.json(
          { error: `Failed to import jobs: ${jobError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      clientsImported: validClients.length,
      jobsImported: validJobs.length,
      clientsRejected: clients.length - validClients.length,
      jobsRejected: jobs.length - validJobs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Import failed: ${error.message}` },
      { status: 500 }
    );
  }
}
