const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// We can't easily query policies via the js client without postgres access, but we can query as the user!
async function run() {
  // We don't have the user's JWT, but we can impersonate or just read the policies using postgres if we have the connection string.
  // We don't have the connection string.
  // Let's just check the jobs table to see if RLS is enabled.
  const { data, error } = await supabase.from('jobs').select('id').limit(1);
  console.log("Service role works:", data ? "yes" : error);
}
run();
