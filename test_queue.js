require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('email_queue').select('status, count(*)', { count: 'exact' }).group('status');
  console.log('Status counts:', data);
  const { data: pending } = await supabase.from('email_queue').select('scheduled_for').eq('status', 'pending').order('scheduled_for').limit(5);
  console.log('Next 5 pending:', pending);
}
run();
