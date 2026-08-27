import { createClient } from "@supabase/supabase-js";
const url = "https://wsuimsjhjreqspvqpbbl.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTYzMDYsImV4cCI6MjA5NjA5MjMwNn0.q7rH6Nqqo4DjgsUnz5X7Afl9MC0R4Z09J4tl-k8lFUk";

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function loadAllRows(table) {
  const PAGE = 1000;
  console.log(`Starting ${table}`);
  const { data: first, error: countErr, count } = await supabase
    .from(table)
    .select("id", { count: "exact" })
    .range(0, PAGE - 1);
  if (countErr) { console.error("Count err:", countErr); return; }
  console.log(`${table} count: ${count}`);
  
  const totalPages = Math.ceil(count / PAGE);
  let pageFailed = false;
  const pages = [];
  
  const CHUNK_SIZE = 5;
  for (let startPage = 1; startPage < totalPages; startPage += CHUNK_SIZE) {
    if (pageFailed) break;
    const chunkReqs = [];
    for (let page = startPage; page < Math.min(startPage + CHUNK_SIZE, totalPages); page++) {
      chunkReqs.push(
        supabase
          .from(table)
          .select("id")
          .range(page * PAGE, page * PAGE + PAGE - 1)
          .then(({ data, error: e }) => {
            if (e) {
              console.error(`Error page ${page}:`, e);
              pageFailed = true;
              return [];
            }
            return data || [];
          })
      );
    }
    const chunkResults = await Promise.all(chunkReqs);
    pages.push(...chunkResults);
    console.log(`${table}: Loaded up to page ${Math.min(startPage + CHUNK_SIZE - 1, totalPages - 1)}`);
  }
  console.log(`${table} done!`);
}

console.time("hydrate");
Promise.all([
  loadAllRows("prospects"),
  loadAllRows("leads")
]).then(() => {
  console.timeEnd("hydrate");
});
