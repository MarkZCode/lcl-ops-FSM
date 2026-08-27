require('dotenv').config({ path: '.env.local' });
const CRON_SECRET = process.env.CRON_SECRET;

async function run() {
  const url = 'https://lcl-ops.vercel.app/api/email-queue/process';
  console.log(`Triggering ${url} with CRON_SECRET...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  }).catch(e => e);
  
  if (res && res.ok) {
    console.log("Triggered successfully. Status:", res.status);
    const json = await res.json().catch(() => ({}));
    console.log("Response:", json);
  } else {
    console.error("Failed to trigger", res);
  }
}

run();
