const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw"; // service role
async function test() {
  const res = await fetch(url + "rpc/exec_sql", {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "SELECT * FROM pg_policies WHERE tablename = 'jobs';" })
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test();
