const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/prospects?select=id";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTYzMDYsImV4cCI6MjA5NjA5MjMwNn0.q7rH6Nqqo4DjgsUnz5X7Afl9MC0R4Z09J4tl-k8lFUk";
async function test() {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Prefer": "count=exact" } });
  console.log("Prospects Count HTTP:", res.status);
  console.log("Prospects Count Header:", res.headers.get("content-range"));
}
test();
