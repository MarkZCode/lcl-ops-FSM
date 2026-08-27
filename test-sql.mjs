import { createClient } from "@supabase/supabase-js";
const url = "https://wsuimsjhjreqspvqpbbl.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw"; // service role
const sb = createClient(url, key);

async function test() {
  const { data, error } = await sb.from("prospects").upsert({ id: "test-1", data: {} });
  console.log("Service role upsert to prospects:", data, error);
}
test();
