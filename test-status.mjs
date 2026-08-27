import { createClient } from "@supabase/supabase-js";
const url = "https://wsuimsjhjreqspvqpbbl.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTYzMDYsImV4cCI6MjA5NjA5MjMwNn0.q7rH6Nqqo4DjgsUnz5X7Afl9MC0R4Z09J4tl-k8lFUk";
const supabase = createClient(url, key);

async function run() {
  const { data } = await supabase.from("prospects").select("data").limit(1000);
  const counts = { won: 0, open: 0, lost: 0 };
  for (const row of data) {
    const bucket = row.data.statusBucket || "open";
    counts[bucket]++;
  }
  console.log(counts);
}
run();
