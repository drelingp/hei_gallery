import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// `prisma generate` validates env() vars in the schema but does not connect.
// Fill gaps so `npm run build` works on Vercel before secrets are the only
// source of truth, without overriding a real DATABASE_URL from the environment
// or from .env.
loadDotEnv('.env');

const placeholder =
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public';

if (!process.env.DATABASE_URL) process.env.DATABASE_URL = placeholder;
if (!process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}

execSync('prisma generate', { stdio: 'inherit', env: process.env });

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
