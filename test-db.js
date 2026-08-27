const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('jobs').select('id, data').then(res => {
  console.log("Total jobs in DB:", res.data?.length);
  if(res.data) res.data.forEach(j => console.log(j.data?.clientId, j.data?.services));
});
