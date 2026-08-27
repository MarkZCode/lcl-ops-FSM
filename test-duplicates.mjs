import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const url = "https://wsuimsjhjreqspvqpbbl.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from("prospects").select("id").limit(3000);
  console.log("Got", data.length, "rows");
  
  const ids = new Set();
  let dups = 0;
  for (const row of data) {
    if (ids.has(row.id)) dups++;
    ids.add(row.id);
  }
  console.log("Unique IDs:", ids.size);
  console.log("Duplicate IDs:", dups);
  
  if (dups === 0 && data.length > 1000) {
     console.log("Sample IDs:", data.slice(0, 5).map(r => r.id));
  }
}
run();
