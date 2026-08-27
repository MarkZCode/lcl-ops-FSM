const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));

async function run() {
  let remaining = 1;
  while (remaining > 0) {
    console.log("Triggering processor on Vercel production...");
    try {
      const res = await fetch("https://lcl-ops.vercel.app/api/email-queue/process", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.CRON_SECRET}` }
      });
      const data = await res.json();
      console.log(`Sent: ${data.sent}, Remaining: ${data.remainingDue}, RanOutOfTime: ${data.ranOutOfTime}`);
      remaining = data.remainingDue;
      if (remaining === 0) {
         console.log("Queue fully drained!");
         break;
      }
    } catch (e) {
      console.log("Fetch failed:", e);
      break;
    }
  }
}
run();
