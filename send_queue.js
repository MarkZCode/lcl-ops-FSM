const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: queue, error } = await supabase.from('email_queue').select('*').eq('status', 'pending');
  if (error) {
    console.error("Error fetching queue", error);
    return;
  }
  
  const toSend = queue.map(item => item.id);
  
  console.log(`Setting scheduled_for to now for ${toSend.length} emails...`);
  if (toSend.length > 0) {
    const { error: updateErr } = await supabase
      .from('email_queue')
      .update({ scheduled_for: new Date().toISOString() })
      .in('id', toSend);
    if (updateErr) {
      console.error("Error updating", updateErr);
    } else {
      console.log("Successfully updated. Triggering process endpoint...");
      const res = await fetch('http://localhost:3200/api/email-queue/process', { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        console.log("Process endpoint triggered successfully.");
      } else {
        console.log("Process endpoint could not be triggered on localhost, you may need to click 'Process now' in the UI or hit the Vercel URL.");
      }
    }
  }
}

run();
