import { createClient } from "@supabase/supabase-js";
const url = "https://wsuimsjhjreqspvqpbbl.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw";
const sb = createClient(url, key);

async function test() {
  const { data: p, error: pe } = await sb.from("prospects").select("id").limit(5);
  console.log("Prospects:", p, "Error:", pe);
  const { data: j, error: je } = await sb.from("jobs").select("id").limit(5);
  console.log("Jobs:", j, "Error:", je);
}
test();
