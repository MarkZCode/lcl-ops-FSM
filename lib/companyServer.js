// Server side of Settings → Company details: lay the saved company details
// over lib/invoiceConfig.js before a cron writes an email or a PDF.
import { supabaseAdmin } from "./supabaseAdmin";
import { applyCompany } from "./invoiceConfig";

export async function applyCompanyServer() {
  if (!supabaseAdmin) return;
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("data").eq("id", "company").maybeSingle();
    if (data?.data) applyCompany(data.data);
  } catch {}
}
