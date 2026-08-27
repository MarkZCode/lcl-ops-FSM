const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: queue, error } = await supabase.from('email_queue').select('*').eq('status', 'pending');
  if (error) {
    console.error("Error fetching queue", error);
    return;
  }
  
  let eicrCount = 0;
  let fraGasCount = 0;
  
  for (const item of queue) {
    console.log(`Queue item: ${item.id}, subject: ${item.subject}, campaign_label: ${item.campaign_label}`);
    if (item.subject.includes('EICR') || item.campaign_label?.includes('EICR')) {
      eicrCount++;
    } else if (item.subject.includes('FRA') || item.subject.includes('Gas Safety') || item.campaign_label?.includes('FRA') || item.campaign_label?.includes('Gas Safety') || item.campaign_label?.includes('GAS')) {
      fraGasCount++;
    }
  }
  
  console.log(`Found ${eicrCount} EICR queued emails.`);
  console.log(`Found ${fraGasCount} FRA/Gas Safety queued emails.`);
  console.log(`Total pending in queue: ${queue.length}`);
}

run();
