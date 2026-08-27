const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Cancelling all pending emails...");
  const { data, error } = await supabase
    .from('email_queue')
    .update({ status: 'cancelled', cancelled_reason: 'manual emergency stop' })
    .eq('status', 'pending');
  
  if (error) {
    console.error("Error cancelling emails:", error);
    return;
  }
  console.log("All pending emails cancelled successfully.");
}
run();
