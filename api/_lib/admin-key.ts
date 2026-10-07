import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

function dataDir(): string {
  const configured = process.env.CLAIMS_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return '/tmp/tipnovel-claims';
  return path.resolve(process.cwd(), 'data-claims');
}

export function getAdminKey(): string | null {
  const configured = process.env.ADMIN_KEY?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return null;
  try {
    const file = path.join(dataDir(), '.admin-key');
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf8').trim();
      if (saved) return saved;
    }
    const fresh = randomBytes(24).toString('hex');
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(file, fresh);
    return fresh;
  } catch {
    return null;
  }
}

export function checkAdminKey(value: unknown): boolean {
  const key = getAdminKey();
  return typeof value === 'string' && value.length > 0 && key !== null && value === key;
}
