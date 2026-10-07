import { readEvidenceBytes } from './_lib/claims-store';
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
  send: (body: string | Uint8Array) => void;
};

function queryValue(request: HandlerRequest, key: string) {
  const value = request.query?.[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function handler(request: HandlerRequest, response: HandlerResponse) {
  if (request.method && request.method !== 'GET') {
    response.status(405).json({ error: 'Only GET requests are supported.' });
    return;
  }
  if (!checkAdminKey(queryValue(request, 'key'))) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  const pathname = queryValue(request, 'path');
  if (!pathname || pathname.includes('..') || pathname.startsWith('/')) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  const file = await readEvidenceBytes(pathname);
  if (!file) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Cache-Control', 'private, max-age=3600');
  response.status(200).send(file.data);
}
