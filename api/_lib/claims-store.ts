import { randomBytes } from 'node:crypto';

export type StoredEvidence = {
  name: string;
  path: string;
};

export type InputEvidence = {
  name: string;
  dataUrl: string;
};

export type StoredFollowup = {
  message: string;
  evidence: StoredEvidence[];
  createdAt: number;
};

export type StoredQuestion = {
  id: string;
  text: string;
  createdAt: number;
};

export type ClaimStatus = 'pending' | 'more-info' | 'approved' | 'rejected';

export type ServerClaim = {
  id: string;
  authorName: string;
  authorId: string;
  originPlatform: string;
  originUsername: string;
  originUrl: string;
  evidence: StoredEvidence[];
  message: string;
  email: string;
  payoutWallet: string;
  balanceAtSubmit: string;
  status: ClaimStatus;
  questions: StoredQuestion[];
  followups: StoredFollowup[];
  detailTokens: Array<{ token: string; createdAt: number }>;
  approveTx: string | null;
  createdAt: number;
  updatedAt: number;
};

const MAX_EVIDENCE_ITEMS = 10;
const EVIDENCE_BUCKET = 'claim-evidence';

type Row = {
  id: string;
  author_name: string;
  author_id: string;
  origin_platform: string;
  origin_username: string;
  origin_url: string;
  evidence: StoredEvidence[];
  message: string;
  email: string;
  payout_wallet: string;
  balance_at_submit: string;
  status: ClaimStatus;
  questions: StoredQuestion[];
  followups: StoredFollowup[];
  detail_tokens: Array<{ token: string; createdAt: number }>;
  approve_tx: string | null;
  created_at: string;
  updated_at: string;
};

function config(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) throw new Error('Claim storage is not configured.');
  return { url, key };
}

function toClaim(row: Row): ServerClaim {
  return {
    id: row.id,
    authorName: row.author_name,
    authorId: row.author_id,
    originPlatform: row.origin_platform,
    originUsername: row.origin_username,
    originUrl: row.origin_url,
    evidence: row.evidence ?? [],
    message: row.message,
    email: row.email,
    payoutWallet: row.payout_wallet,
    balanceAtSubmit: row.balance_at_submit,
    status: row.status,
    questions: row.questions ?? [],
    followups: row.followups ?? [],
    detailTokens: row.detail_tokens ?? [],
    approveTx: row.approve_tx,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

async function request(pathname: string, init: RequestInit & { query?: string }): Promise<Response> {
  const { url, key } = config();
  return fetch(`${url}${pathname}${init.query ?? ''}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function readJson<T>(response: Response, trouble: string): Promise<T> {
  if (!response.ok) throw new Error(trouble);
  return (await response.json()) as T;
}

async function updateRow(id: string, patch: Partial<Row>): Promise<ServerClaim> {
  const response = await request('/rest/v1/claims', {
    method: 'PATCH',
    query: `?id=eq.${encodeURIComponent(id)}`,
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  const rows = await readJson<Row[]>(response, 'The review could not be saved.');
  const row = rows[0];
  if (!row) throw new Error('Claim not found.');
  return toClaim(row);
}

async function storeEvidenceBytes(claimId: string, index: number, dataUrl: string): Promise<StoredEvidence> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Screenshots must be images.');
  const { url, key } = config();
  const name = `evidence-${index + 1}.jpg`;
  const pathname = `${claimId}/${name}`;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const upload = await fetch(`${url}/storage/v1/object/${EVIDENCE_BUCKET}/${pathname}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': match[1],
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!upload.ok) throw new Error('Screenshots could not be stored. Try again.');
  return { name, path: pathname };
}

export async function readEvidenceBytes(pathname: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  if (!pathname || pathname.includes('..')) return null;
  try {
    const { url, key } = config();
    const response = await fetch(`${url}/storage/v1/object/${EVIDENCE_BUCKET}/${pathname}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return null;
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

function rid(prefix: string, bytes = 12): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isAuthorId(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function cleanInputEvidence(value: unknown): InputEvidence[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_ITEMS) return null;
  const items: InputEvidence[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.dataUrl !== 'string') return null;
    if (!record.dataUrl.startsWith('data:image/')) return null;
    items.push({ name: record.name.slice(0, 80), dataUrl: record.dataUrl });
  }
  return items;
}

export function publicClaim(claim: ServerClaim): Omit<ServerClaim, 'email'> {
  const { email: _email, ...rest } = claim;
  return rest;
}

export async function createClaim(input: Record<string, unknown>): Promise<ServerClaim> {
  const authorName = typeof input.authorName === 'string' ? input.authorName.trim() : '';
  const originPlatform = typeof input.originPlatform === 'string' ? input.originPlatform.trim() : '';
  const originUsername = typeof input.originUsername === 'string' ? input.originUsername.trim() : '';
  if (!authorName) throw new Error('An author name is required.');
  if (!isAuthorId(input.authorId)) throw new Error('The author record is invalid.');
  if (!originPlatform) throw new Error('Name the place the novel was first uploaded.');
  if (!originUsername) throw new Error('Add the username on that platform.');
  const uploads = cleanInputEvidence(input.evidence);
  if (!uploads) throw new Error('Attach at least one dashboard screenshot.');
  if (!isEmail(input.email)) throw new Error('Add an email where the review outcome can reach you.');
  if (!isHexAddress(input.payoutWallet)) throw new Error('That payout wallet address does not look right.');

  const now = new Date().toISOString();
  const id = rid('c');
  const evidence: StoredEvidence[] = [];
  for (const [index, item] of uploads.entries()) {
    evidence.push(await storeEvidenceBytes(id, index, item.dataUrl));
  }

  const response = await request('/rest/v1/claims', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      author_name: authorName,
      author_id: input.authorId,
      origin_platform: originPlatform,
      origin_username: originUsername,
      origin_url: typeof input.originUrl === 'string' ? input.originUrl.trim().slice(0, 500) : '',
      evidence,
      message: typeof input.message === 'string' ? input.message.trim().slice(0, 2000) : '',
      email: (input.email as string).trim(),
      payout_wallet: input.payoutWallet as string,
      balance_at_submit: typeof input.balanceAtSubmit === 'string' ? input.balanceAtSubmit.slice(0, 40) : '0',
      status: 'pending',
    }),
  });
  const rows = await readJson<Row[]>(response, 'The claim could not be sent. Try again.');
  if (!rows[0]) throw new Error('The claim could not be sent. Try again.');
  return toClaim(rows[0]);
}

export async function listClaims(): Promise<ServerClaim[]> {
  const response = await request('/rest/v1/claims', {
    method: 'GET',
    query: '?select=*&order=created_at.desc',
  });
  const rows = await readJson<Row[]>(response, 'The queue could not be loaded.');
  return rows.map(toClaim);
}

export async function getClaim(id: string): Promise<ServerClaim | null> {
  const response = await request('/rest/v1/claims', {
    method: 'GET',
    query: `?id=eq.${encodeURIComponent(id)}&select=*`,
  });
  const rows = await readJson<Row[]>(response, 'The claim could not be loaded.');
  return rows[0] ? toClaim(rows[0]) : null;
}

export async function getClaimByToken(token: string): Promise<{ claim: ServerClaim; tokenIssuedAt: number } | null> {
  if (typeof token !== 'string' || !token) return null;
  const claims = await listClaims();
  const claim = claims.find((entry) => entry.detailTokens.some((entry2) => entry2.token === token));
  if (!claim) return null;
  const record = claim.detailTokens.find((entry) => entry.token === token);
  return { claim, tokenIssuedAt: record?.createdAt ?? claim.updatedAt };
}

export async function addFollowup(token: string, message: string, evidence: unknown): Promise<ServerClaim> {
  const found = await getClaimByToken(token);
  if (!found) throw new Error('This follow-up link is invalid.');
  const uploads = Array.isArray(evidence) ? evidence : [];
  if (uploads.length > MAX_EVIDENCE_ITEMS) throw new Error('Attach at most ten screenshots.');
  const items = cleanInputEvidence(uploads.length ? uploads : []);
  const cleaned = items ?? [];
  const text = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
  if (!text && cleaned.length === 0 && uploads.length === 0) throw new Error('Write a reply or attach screenshots.');
  if (uploads.length > 0 && cleaned.length === 0) throw new Error('Those screenshots could not be read.');

  const claim = found.claim;
  const stored: StoredEvidence[] = [];
  const base = claim.evidence.length + claim.followups.reduce((count, entry) => count + entry.evidence.length, 0);
  for (const [index, item] of cleaned.entries()) {
    stored.push(await storeEvidenceBytes(claim.id, base + index, item.dataUrl));
  }
  const followups = [...claim.followups, { message: text, evidence: stored, createdAt: Date.now() }];
  return updateRow(claim.id, {
    followups,
    status: 'pending',
  } as Partial<Row>);
}

export async function requestDetails(id: string, questions: unknown): Promise<{ token: string }> {
  const items = Array.isArray(questions)
    ? questions
      .filter((question): question is string => typeof question === 'string' && question.trim().length > 0)
      .map((question) => question.trim().slice(0, 500))
    : [];
  if (items.length === 0) throw new Error('Write at least one question.');
  const claim = await getClaim(id);
  if (!claim) throw new Error('Claim not found.');
  const token = rid('t', 24);
  const now = Date.now();
  const updated: ServerClaim = {
    ...claim,
    questions: [...claim.questions, ...items.map((text) => ({ id: rid('q', 8), text, createdAt: now }))],
    detailTokens: [...claim.detailTokens, { token, createdAt: now }],
    status: 'more-info',
  };
  await updateRow(id, {
    questions: updated.questions,
    detail_tokens: updated.detailTokens,
    status: 'more-info',
  } as Partial<Row>);
  return { token };
}

export async function setClaimStatus(id: string, status: ClaimStatus, approveTx: string | null): Promise<ServerClaim> {
  return updateRow(id, { status, approve_tx: approveTx });
}
