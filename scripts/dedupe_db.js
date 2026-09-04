require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false }
  }
);

async function dedupeTable(tableName) {
  console.log(`\n--- Deduping ${tableName} ---`);
  
  // 1. Fetch all rows (just the IDs) to find duplicates
  let allIds = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select("id")
      .range(page * 1000, (page + 1) * 1000 - 1);
      
    if (error) {
      if (error.code === '42P01') {
        // relation does not exist
        console.log(`Table ${tableName} does not exist yet.`);
        return;
      }
      throw error;
    }
    
    if (!data || data.length === 0) break;
    allIds.push(...data.map(r => r.id));
    if (data.length < 1000) break;
    page++;
  }
  
  // Find duplicates
  const counts = {};
  for (const id of allIds) {
    counts[id] = (counts[id] || 0) + 1;
  }
  
  const duplicatedIds = Object.keys(counts).filter(id => counts[id] > 1);
  console.log(`Found ${duplicatedIds.length} duplicated IDs in ${tableName}`);
  
  for (const id of duplicatedIds) {
    console.log(`Processing duplicate ID: ${id} (${counts[id]} copies)`);
    
    // Fetch all copies for this ID to find the newest one
    const { data: copies, error: fetchErr } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", id);
      
    if (fetchErr) throw fetchErr;
    
    // Sort by updated_at descending
    copies.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const newestCopy = copies[0];
    
    // Delete all copies!
    console.log(`  Deleting all ${copies.length} copies of ${id}...`);
    const { error: delErr } = await supabase
      .from(tableName)
      .delete()
      .eq("id", id);
    if (delErr) throw delErr;
    
    // Re-insert the newest copy
    console.log(`  Re-inserting the newest copy of ${id}...`);
    const { error: insErr } = await supabase
      .from(tableName)
      .insert(newestCopy);
    if (insErr) throw insErr;
  }
  
  console.log(`Done deduping ${tableName}`);
}

async function run() {
  const tables = [
    "jobs",
    "clients",
    "prospects",
    "leads",
    "letting_agents",
    "engineer_recruits",
    "app_settings"
  ];
  
  for (const table of tables) {
    await dedupeTable(table);
  }
}

run().catch(console.error);
