const url = "https://wsuimsjhjreqspvqpbbl.supabase.co/rest/v1/clients?select=id&limit=5";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzdWltc2poanJlcXNwdnFwYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTYzMDYsImV4cCI6MjA5NjA5MjMwNn0.q7rH6Nqqo4DjgsUnz5X7Afl9MC0R4Z09J4tl-k8lFUk";

async function test() {
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  const text = await res.text();
  console.log("Clients HTTP status:", res.status);
  console.log("Clients Body:", text);
}
test();
