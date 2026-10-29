const fs = require('fs');
const { Client } = require('pg');

async function importData(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON file:', e.message);
    process.exit(1);
  }

  // If the query returned a row with json_build_object, unwrap it
  if (Array.isArray(data) && data[0] && data[0].json_build_object) {
    data = data[0].json_build_object;
  } else if (data.json_build_object) {
    data = data.json_build_object;
  }

  const client = new Client({
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.ticobtvzquniifnqnaju',
    password: 'ticobtvzquniifnqnaju',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to new Supabase DB!');

  // Simple key-value tables
  const kvTables = ['clients', 'jobs', 'engineers', 'app_settings', 'tasks', 'letting_agents', 'engineer_recruits', 'cold_leads'];

  for (const table of kvTables) {
    const rows = data[table] || [];
    console.log(`Inserting ${rows.length} rows into ${table}...`);
    for (const r of rows) {
      if (!r.id) continue;
      await client.query(
        `insert into ${table} (id, data, updated_at) values ($1, $2, $3)
         on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;`,
        [r.id, typeof r.data === 'string' ? r.data : JSON.stringify(r.data), r.updated_at || new Date().toISOString()]
      );
    }
  }

  // Users
  const users = data.users || [];
  console.log(`Inserting ${users.length} users into auth.users...`);
  for (const u of users) {
    if (!u.id || !u.email) continue;
    await client.query(
      `insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        $2, $3, now(), $4, $5, now(), now()
      ) on conflict (id) do update set
        encrypted_password = excluded.encrypted_password,
        raw_app_meta_data = excluded.raw_app_meta_data,
        raw_user_meta_data = excluded.raw_user_meta_data;`,
      [
        u.id,
        u.email,
        u.encrypted_password,
        typeof u.raw_app_meta_data === 'string' ? u.raw_app_meta_data : JSON.stringify(u.raw_app_meta_data || {}),
        typeof u.raw_user_meta_data === 'string' ? u.raw_user_meta_data : JSON.stringify(u.raw_user_meta_data || {})
      ]
    );

    // Also ensure identity exists in auth.identities so Supabase Auth allows password login
    await client.query(
      `insert into auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        $1, $1, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now()
      ) on conflict (provider, id) do nothing;`,
      [u.id, u.email]
    );
  }

  console.log('ALL DATA IMPORTED SUCCESSFULLY!');
  await client.end();
}

if (process.argv[2]) {
  importData(process.argv[2]);
} else {
  console.log('Usage: node import_to_new_supabase.js <path-to-json>');
}
