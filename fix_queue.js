const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Updating scheduled_for for pending emails...");
  const { data, error } = await supabase
    .from('email_queue')
    .update({ scheduled_for: new Date().toISOString() })
    .eq('status', 'pending');
  
  if (error) {
    console.error("Error updating:", error);
    return;
  }
  console.log("Updated pending emails successfully.");

  console.log("Triggering processor...");
  try {
    const res = await fetch("http://localhost:3000/api/email-queue/process", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CRON_SECRET}` }
    });
    console.log("Processor triggered, status:", res.status);
  } catch (e) {
    console.log("Fetch to local server failed, this is normal if it's not running.");
  }
}
run();
