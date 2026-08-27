const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));

async function run() {
  console.log("Triggering processor on Vercel production...");
  try {
    const res = await fetch("https://lcl-ops.vercel.app/api/email-queue/process", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CRON_SECRET}` }
    });
    console.log("Production Processor triggered, status:", res.status);
    const body = await res.text();
    console.log("Response body:", body);
  } catch (e) {
    console.log("Fetch failed:", e);
  }
}
run();
