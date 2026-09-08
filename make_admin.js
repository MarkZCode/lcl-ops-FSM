const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function makeAdmin() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error fetching users:", error);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log("No users found! Please sign up first.");
    return;
  }
  
  const user = users.find(u => u.email === 'landlordcompliancelondon@gmail.com') || users[0];
  
  console.log(`Found user: ${user.email}. Updating to admin...`);
  
  const { data, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { app_metadata: { ...user.app_metadata, role: 'admin' } }
  );
  
  if (updateError) {
    console.error("Error updating user:", updateError);
  } else {
    console.log("Success! User is now admin.");
  }
}

makeAdmin();
