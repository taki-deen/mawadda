import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp } from './app';
import { ensureQuestionnaire } from './catalog';
import { connectDatabase } from './database';
import { seedAdminDemo } from './demoSeed';
import type { Config } from '../src/types';

const demo = process.argv.includes('--demo');
const androidDemo = demo && process.argv.includes('--android');
if (existsSync('.env')) loadEnvFile();
const { APP_ORIGIN, DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MAWADDA_ADMIN_IDS, MAWADDA_OWNER_IDS, MAWADDA_DEMO_OWNER_PASSWORD } = process.env;
const port = androidDemo ? 3004 : Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (demo && process.env.NODE_ENV === 'production') throw new Error('Demo mode is local development only');
if (!demo && (!DATABASE_URL || !APP_ORIGIN || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Set DATABASE_URL, APP_ORIGIN, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for managed mode');
}
const authUrl = demo ? null : new URL(SUPABASE_URL!);
const appUrl = demo ? null : new URL(APP_ORIGIN!);
if (appUrl && (appUrl.protocol !== 'https:' || authUrl?.protocol !== 'https:' || appUrl.origin !== APP_ORIGIN)) {
  throw new Error('Use HTTPS origins for managed mode');
}
const config: Config = demo ? { demo: true } : { demo: false, authUrl: authUrl!.origin, authKey: SUPABASE_PUBLISHABLE_KEY! };
if (!config.demo && !config.authKey.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key');
const managedAdmins = (MAWADDA_ADMIN_IDS ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
const managedOwners = (MAWADDA_OWNER_IDS ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
if ([...managedAdmins, ...managedOwners].some(id => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))) {
  throw new Error('MAWADDA_ADMIN_IDS and MAWADDA_OWNER_IDS must contain Supabase user IDs');
}
if (demo && MAWADDA_DEMO_OWNER_PASSWORD && (MAWADDA_DEMO_OWNER_PASSWORD.length < 12 || MAWADDA_DEMO_OWNER_PASSWORD.length > 128)) {
  throw new Error('The demo owner password must contain 12 to 128 characters');
}
const build = fileURLToPath(new URL('../build/client/', import.meta.url));
if (!existsSync(`${build}index.html`)) throw new Error('Run npm run build first');

const connection = await connectDatabase(demo ? undefined : DATABASE_URL);
const questionnaire = await ensureQuestionnaire(connection.db);
if (demo && MAWADDA_DEMO_OWNER_PASSWORD) await seedAdminDemo(connection.db, questionnaire);
const server = createApp(connection.db, questionnaire, config, build, appUrl?.origin, managedAdmins, managedOwners, MAWADDA_DEMO_OWNER_PASSWORD).listen(port, '127.0.0.1', () => {
  console.log(`Mawadda ${demo ? 'pilot demo' : 'pilot'}: http://127.0.0.1:${port}/${androidDemo ? 'android/' : ''}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { server.close(() => { void connection.close(); }); });
}
