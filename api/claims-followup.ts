import { addFollowup, getClaimByToken } from './_lib/claims-store';

type QueryValue = string | string[] | undefined;

type HandlerRequest = {
  method?: string;
  query?: Record<string, QueryValue>;
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

function queryValue(request: HandlerRequest, key: string) {
  const value = request.query?.[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function handler(request: HandlerRequest, response: HandlerResponse) {
  if (request.method === 'GET') {
    const found = getClaimByToken(queryValue(request, 'token'));
    if (!found) return sendError(response, 404, 'This follow-up link is invalid.');
    return response.status(200).json({
      claimId: found.claim.id,
      authorName: found.claim.authorName,
      status: found.claim.status,
      questions: found.claim.questions,
      followupCount: found.claim.followups.length,
    });
  }

  if (request.method === 'POST') {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : '';
    const message = typeof body.message === 'string' ? body.message : '';
    try {
      addFollowup(token, message, body.evidence);
      return response.status(200).json({ ok: true });
    } catch (error) {
      return sendError(response, 400, error instanceof Error ? error.message : 'The reply could not be sent.');
    }
  }

  response.setHeader('Allow', 'GET, POST');
  return sendError(response, 405, 'Only GET and POST requests are supported.');
}
