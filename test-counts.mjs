const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTYzMDYsImV4cCI6MjA5NjA5MjMwNn0.q7rH6Nqqo4DjgsUnz5X7Afl9MC0R4Z09J4tl-k8lFUk";
const base = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1";
async function getCount(table) {
  const res = await fetch(`${base}/${table}?select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Prefer": "count=exact" } });
  return res.headers.get("content-range");
}
async function test() {
  console.log("Prospects:", await getCount("prospects"));
  console.log("Leads:", await getCount("leads"));
  console.log("Jobs:", await getCount("jobs"));
  console.log("Clients:", await getCount("clients"));
}
test();
