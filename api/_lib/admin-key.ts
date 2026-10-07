function readEnv(key: string): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.[key]?.trim();
  return value || null;
}

export function getAdminKey(): string | null {
  return readEnv('ADMIN_KEY');
}

export function checkAdminKey(value: unknown): boolean {
  const key = getAdminKey();
  return typeof value === 'string' && value.length > 0 && key !== null && value === key;
}
