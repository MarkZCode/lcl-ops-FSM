const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw"; // service role key

async function test() {
  const res = await fetch("https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/", {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log("Root:", res.status);
}
test();
