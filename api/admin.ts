import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAdminKey } from './_lib/admin-key';

type QueryValue = string | string[] | undefined;

type HandlerRequest = {
  method?: string;
  query?: Record<string, QueryValue>;
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: string) => void;
};

const dir = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(request: HandlerRequest, response: HandlerResponse) {
  const value = request.query?.key;
  const key = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  if (!checkAdminKey(key)) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  const page = readFileSync(path.join(dir, '_lib', 'admin.html'), 'utf8');
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.status(200).send(page);
}
