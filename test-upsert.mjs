async function run() {
  const payload = { prospects: [{ id: "test-api-upsert", data: { foo: "bar" } }] };
  const res = await fetch("https://lcl-ops.vercel.app/api/prospects/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
run();
