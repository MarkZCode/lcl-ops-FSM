const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/jobs";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxNjMwNiwiZXhwIjoyMDk2MDkyMzA2fQ.kfGWbUeOhQiUgRaPQ1-50diq17HC5VzN6iUIq9Y_juw"; // service role

async function test() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify({ id: "test-job-123", data: { name: "test" } })
  });
  const text = await res.text();
  console.log("Upsert Service Role HTTP status:", res.status);
  console.log("Upsert Service Role Body:", text);
}
test();
