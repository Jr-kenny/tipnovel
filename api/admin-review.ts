import { getClaim, requestDetails, setClaimStatus } from './_lib/claims-store';
import { checkAdminKey } from './_lib/admin-key';

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
  if (!checkAdminKey(body.key)) return sendError(response, 404, 'Not found.');
  const id = typeof body.id === 'string' ? body.id : '';
  const action = typeof body.action === 'string' ? body.action : '';

  try {
    if (action === 'approve') {
      const tx = typeof body.approveTx === 'string' ? body.approveTx.trim() : '';
      const claim = await setClaimStatus(id, 'approved', tx || null);
      return response.status(200).json({ ok: true, status: claim.status });
    }
    if (action === 'reject') {
      const claim = await setClaimStatus(id, 'rejected', null);
      return response.status(200).json({ ok: true, status: claim.status });
    }
    if (action === 'more-info') {
      const claim = await getClaim(id);
      if (!claim) return sendError(response, 404, 'Claim not found.');
      const { token } = await requestDetails(id, body.questions);
      return response.status(200).json({ ok: true, status: 'more-info', token });
    }
    return sendError(response, 400, 'Unknown action.');
  } catch (error) {
    return sendError(response, 400, error instanceof Error ? error.message : 'The review could not be saved.');
  }
}
