const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.auth.admin.listUsers().then(res => {
  if (res.data && res.data.users) {
    res.data.users.forEach(u => console.log(u.email, u.user_metadata, u.app_metadata));
  } else {
    console.log("No users or error", res.error);
  }
});
