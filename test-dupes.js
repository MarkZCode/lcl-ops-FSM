require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const tables = ["jobs", "clients", "prospects", "engineers"];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("id");
    if (error) {
      console.log(t, error.message);
      continue;
    }
    const counts = {};
    for (const row of data) counts[row.id] = (counts[row.id] || 0) + 1;
    const dupes = Object.entries(counts).filter(([id, c]) => c > 1);
    console.log(`Table ${t}: ${dupes.length} duplicated IDs`);
    if (dupes.length) console.log(dupes.slice(0, 5));
  }
}
run();
