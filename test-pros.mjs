const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/prospects?select=id&limit=5";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw"; // service role
async function test() {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  console.log("Prospects:", res.status, await res.text());
}
test();
