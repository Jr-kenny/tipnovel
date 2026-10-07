export type ClaimEvidence = {
  name: string;
  dataUrl: string;
};

export type ClaimFollowup = {
  message: string;
  evidence: ClaimEvidence[];
  createdAt: number;
};

export type ClaimStatus = 'pending' | 'more-info' | 'approved' | 'rejected';

export type ClaimView = {
  id: string;
  authorName: string;
  authorId: `0x${string}`;
  originPlatform: string;
  originUsername: string;
  originUrl: string;
  evidence: ClaimEvidence[];
  message: string;
  payoutWallet: string;
  balanceAtSubmit: string;
  status: ClaimStatus;
  followups: ClaimFollowup[];
  createdAt: number;
};

export type ClaimDetailToken = {
  token: string;
  claimId: string;
  authorName: string;
  questions: Array<{ id: string; text: string }>;
  status: ClaimStatus;
};

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => undefined);
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return 'The request failed. Try again.';
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function submitClaim(input: {
  authorName: string;
  authorId: `0x${string}`;
  originPlatform: string;
  originUsername: string;
  originUrl: string;
  evidence: ClaimEvidence[];
  message: string;
  email: string;
  payoutWallet: string;
  balanceAtSubmit: string;
}): Promise<{ id: string }> {
  const result = (await postJson('/api/claims/submit', input)) as { id: string };
  if (!result?.id) throw new Error('The claim could not be saved. Try again.');
  return result;
}

export async function fetchClaimDetail(token: string): Promise<ClaimDetailToken> {
  const response = await fetch(`/api/claims/followup?token=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ClaimDetailToken;
}

export async function submitFollowup(
  token: string,
  input: { message: string; evidence: ClaimEvidence[] },
): Promise<void> {
  await postJson('/api/claims/followup', { token, ...input });
}
