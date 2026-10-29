// Imports the verified CSV/JSON backup into the NEW Supabase project (keys read from the Ops app .env.local).
// Usage:  node scripts/migrate_from_backup.mjs [kv|email|auth|verify]   (default: kv)
// Safe to re-run: every write is an upsert on the primary key.
import fs from 'fs';
import path from 'path';

const BACKUP = '/Users/macbookpro/Documents/LANDLORD COMPLIANCE LONDON/Tools/Claude LCL Ops ORIGINAL/backup';
const ENV_FILE = '/Users/macbookpro/Documents/LANDLORD COMPLIANCE LONDON/Tools/Claude LCL Ops ORIGINAL/.env.local';
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8')
    .split('\n').filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error('Missing Supabase env in .env.local');
if (!URL_.includes('ticobtvzquniifnqnaju')) throw new Error('Refusing: .env.local is not the new project');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

function parseCsv(file) {
  const s = fs.readFileSync(path.join(BACKUP, file), 'utf8');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f.replace(/\r$/, '')); rows.push(row); }
  const [hdr, ...data] = rows.filter(r => r.length > 1 || r[0] !== '');
  return data.map(r => Object.fromEntries(hdr.map((h, i) => [h.trim(), r[i] === '' ? null : r[i]])));
}

async function upsert(table, rows, batch = 500, conflict = 'id') {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const r = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`${table} batch ${i}: ${r.status} ${await r.text()}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + batch, rows.length)}/${rows.length}`);
  }
  console.log();
}

async function count(table) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
  return r.ok ? Number((r.headers.get('content-range') || '/?').split('/')[1]) : `ERR ${r.status}`;
}

const KV = {            // new table : [backup file, expected rows]
  clients: ['clients.json', 100],
  jobs: ['jobs.csv', 78],
  engineers: ['engineers.csv', 7],
  app_settings: ['app_settings.csv', 12],
  tasks: ['tasks.csv', 682],
  engineer_recruits: ['engineer_recruits.csv', 1231],
  cold_leads: ['cold_leads_rows.csv', 1207],
  prospects: ['prospects.csv', 14567],
  leads: ['leads.csv', 42471],
};
const EMAIL = { email_queue: ['email_queue_rows.csv', 2461], email_sends: ['email_sends_rows.csv', 2108] };

function loadKv(file) {
  const rows = file.endsWith('.json') ? JSON.parse(fs.readFileSync(path.join(BACKUP, file), 'utf8')) : parseCsv(file);
  return rows.map(r => ({ id: r.id, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data, updated_at: r.updated_at || new Date().toISOString() }));
}

async function runKv() {
  for (const [t, [file, exp]] of Object.entries(KV)) {
    const rows = loadKv(file);
    if (rows.length !== exp) throw new Error(`${file}: parsed ${rows.length}, expected ${exp}`);
    await upsert(t, rows, t === 'leads' || t === 'prospects' ? 200 : 500);
  }
}

async function runEmail() {
  for (const [t, [file, exp]] of Object.entries(EMAIL)) {
    const rows = parseCsv(file).map(r => ({ ...r, data: r.data ? JSON.parse(r.data) : {}, ...(r.step_index ? { step_index: Number(r.step_index) } : {}) }));
    if (rows.length !== exp) throw new Error(`${file}: parsed ${rows.length}, expected ${exp}`);
    await upsert(t, rows);
  }
}

async function runAuth() {
  const users = JSON.parse(fs.readFileSync(path.join(BACKUP, 'auth_users.json'), 'utf8'));
  for (const u of users) {
    const body = { id: u.id, email: u.email, password_hash: u.encrypted_password, email_confirm: true,
      app_metadata: u.raw_app_meta_data || {}, user_metadata: u.raw_user_meta_data || {} };
    const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    console.log(`  ${u.email}: ${r.ok ? 'created' : r.status + ' ' + (await r.text()).slice(0, 150)}`);
  }
  const subs = [...parseCsv('push_subscriptions.csv'), ...parseCsv('push_subscriptions_rows.csv')];
  const rows = [...new Map(subs.map(s => [s.endpoint, s])).values()].map(s => ({
    id: s.id, user_id: s.user_id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, user_agent: s.user_agent, created_at: s.created_at }));
  await upsert('push_subscriptions', rows, 500, 'endpoint');
}

async function verify() {
  for (const [t, [, exp]] of Object.entries({ ...KV, ...EMAIL })) {
    const n = await count(t);
    console.log(`  ${t.padEnd(20)} new=${String(n).padEnd(7)} expected=${String(exp).padEnd(7)} ${n === exp ? '✅' : '❌'}`);
  }
  console.log(`  push_subscriptions   new=${await count('push_subscriptions')}`);
  const j = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=50`, { headers: H })).json();
  console.log(`  auth users           new=${(j.users || []).length} expected=4`);
}

const mode = process.argv[2] || 'kv';
await ({ kv: runKv, email: runEmail, auth: runAuth, verify }[mode])();
if (mode !== 'verify') { console.log('\nVerify:'); await verify(); }
