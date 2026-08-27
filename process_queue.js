const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: queue, error } = await supabase.from('email_queue').select('*').eq('status', 'pending');
  if (error) {
    console.error("Error fetching queue", error);
    return;
  }
  
  const toCancel = [];
  const toSend = [];
  
  for (const item of queue) {
    const subject = item.subject || "";
    const label = item.campaign_label || "";
    if (subject.includes('EICR') || label.includes('EICR')) {
      toCancel.push(item.id);
    } else {
      toSend.push(item.id);
    }
  }
  
  console.log(`Cancelling ${toCancel.length} EICR emails...`);
  if (toCancel.length > 0) {
    const { error: cancelErr } = await supabase
      .from('email_queue')
      .update({ status: 'cancelled', cancelled_reason: 'Requested by user' })
      .in('id', toCancel);
    if (cancelErr) {
      console.error("Error cancelling", cancelErr);
    } else {
      console.log("Successfully cancelled EICR emails.");
    }
  }
  
  console.log(`Ready to send ${toSend.length} other emails.`);
}

run();
