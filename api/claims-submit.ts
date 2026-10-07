import { createClaim } from './_lib/claims-store';

type HandlerRequest = {
  method?: string;
  body?: unknown;
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

function sendError(response: HandlerResponse, status: number, message: string) {
  response.status(status).json({ error: message });
}

export default async function handler(request: HandlerRequest, response: HandlerResponse) {
  if (request.method && request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendError(response, 405, 'Only POST requests are supported.');
  }
  const body = (request.body ?? {}) as Record<string, unknown>;
  try {
    const claim = createClaim(body);
    return response.status(200).json({ id: claim.id });
  } catch (error) {
    return sendError(response, 400, error instanceof Error ? error.message : 'The claim could not be sent.');
  }
}
