import { listClaims } from '../_lib/claims-store';
import { checkAdminKey } from '../_lib/admin-key';

type QueryValue = string | string[] | undefined;

type HandlerRequest = {
  method?: string;
  query?: Record<string, QueryValue>;
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

export default async function handler(request: HandlerRequest, response: HandlerResponse) {
  if (request.method && request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Only GET requests are supported.' });
    return;
  }
  const value = request.query?.key;
  const key = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  if (!checkAdminKey(key)) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  response.status(200).json({ claims: await listClaims() });
}
