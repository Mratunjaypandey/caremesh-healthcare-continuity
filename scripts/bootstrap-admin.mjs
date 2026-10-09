import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Standalone Node scripts do not automatically load Next.js .env.local files.
// Load them here so `npm run bootstrap:admin` works without manually exporting
// secrets into the shell. Existing shell variables always take precedence.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equals = normalized.indexOf('=');
    if (equals <= 0) continue;

    const key = normalized.slice(0, equals).trim();
    let value = normalized.slice(equals + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(path.join(projectRoot, '.env.local'));
loadEnvFile(path.join(projectRoot, '.env'));

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || '' : fallback;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || url.includes('YOUR_PROJECT_REF') || serviceKey.includes('sb_secret_xxxxxxxxx')) {
  console.error('Supabase configuration is missing or still contains placeholders.');
  console.error(`Expected a real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${path.join(projectRoot, '.env.local')}`);
  console.error('Do not expose SUPABASE_SERVICE_ROLE_KEY in client-side code or commit .env.local.');
  process.exit(1);
}

const email = arg('email', process.env.BOOTSTRAP_ADMIN_EMAIL);
const password = arg('password', process.env.BOOTSTRAP_ADMIN_PASSWORD);
const fullName = arg('name', process.env.BOOTSTRAP_ADMIN_NAME || 'CareMesh Administrator');
const orgName = arg('org-name', process.env.BOOTSTRAP_ORG_NAME || 'CareMesh Organization');
const orgSlug = arg('org-slug', process.env.BOOTSTRAP_ORG_SLUG || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));

if (!email || !password) {
  console.error('Usage: npm run bootstrap:admin -- --email admin@yourorg.com --password "StrongPassword123!" --name "Admin Name" --org-name "Your Hospital" --org-slug your-hospital');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: org, error: orgError } = await admin
  .from('organizations')
  .upsert({ name: orgName, slug: orgSlug, status: 'ACTIVE' }, { onConflict: 'slug' })
  .select('id')
  .single();
if (orgError || !org) {
  console.error('Organization setup failed:', orgError?.message || 'Unknown error');
  if ((orgError?.message || '').toLowerCase().includes('permission denied')) {
    console.error('Your Supabase database has table privileges missing for service_role.');
    console.error('Run supabase/patches/002_fix_service_role_privileges.sql in Supabase SQL Editor, then rerun this command.');
  }
  process.exit(1);
}

let user;
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) {
  console.error('Unable to inspect existing auth users:', listError.message);
  process.exit(1);
}
user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (createError || !created.user) {
    console.error('Admin user creation failed:', createError?.message || 'Unknown error');
    process.exit(1);
  }
  user = created.user;
} else {
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password, user_metadata: { ...(user.user_metadata || {}), full_name: fullName } });
  if (updateError) {
    console.error('Admin user update failed:', updateError.message);
    process.exit(1);
  }
}

const { error: profileError } = await admin.from('profiles').upsert({ id: user.id, full_name: fullName, email }, { onConflict: 'id' });
if (profileError) {
  console.error('Profile setup failed:', profileError.message);
  process.exit(1);
}

const { error: membershipError } = await admin.from('organization_memberships').upsert({ org_id: org.id, user_id: user.id, role: 'ADMIN', status: 'active' }, { onConflict: 'org_id,user_id' });
if (membershipError) {
  console.error('Membership setup failed:', membershipError.message);
  process.exit(1);
}

console.log('CareMesh administrator is ready.');
console.log(`Email: ${email}`);
console.log(`Organization: ${orgName}`);
console.log(`Organization ID: ${org.id}`);
console.log(`User ID: ${user.id}`);
