import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { del, list, put } from '@vercel/blob';

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
const MAX_PAYLOAD_BYTES = 6_000_000;

function blobToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function dataDir(): string {
  const configured = process.env.CLAIMS_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return '/tmp/tipnovel-claims';
  return path.resolve(process.cwd(), 'data-claims');
}

function filePath(): string {
  return path.join(dataDir(), 'claims.json');
}

function readAllFiles(): ServerClaim[] {
  try {
    const raw = readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw) as ServerClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllFiles(claims: ServerClaim[]): void {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(claims));
}

async function readAllBlob(token: string): Promise<ServerClaim[]> {
  const found = await list({ prefix: 'claims/', token });
  const records = await Promise.all(
    found.blobs
      .filter((blob) => blob.pathname.endsWith('.json'))
      .map(async (blob) => {
        const response = await fetch(blob.url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return null;
        try {
          return (await response.json()) as ServerClaim;
        } catch {
          return null;
        }
      }),
  );
  return records
    .filter((record): record is ServerClaim => Boolean(record && record.id))
    .sort((left, right) => right.createdAt - left.createdAt);
}

async function writeOneBlob(claim: ServerClaim, token: string): Promise<void> {
  await put(`claims/${claim.id}.json`, JSON.stringify(claim), {
    access: 'private',
    token,
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

async function deleteOneBlob(pathname: string, token: string): Promise<void> {
  const found = await list({ prefix: pathname, limit: 1, token });
  const url = found.blobs.find((blob) => blob.pathname === pathname)?.url;
  if (url) await del(url, { token });
}

export async function readEvidenceBytes(pathname: string): Promise<{ data: Buffer; contentType: string } | null> {
  const token = blobToken();
  if (!token) return null;
  const found = await list({ prefix: pathname, limit: 1, token });
  const blob = found.blobs.find((entry) => entry.pathname === pathname);
  if (!blob) return null;
  const response = await fetch(blob.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return { data: Buffer.from(await response.arrayBuffer()), contentType: blob.contentType || 'image/jpeg' };
}

async function storeEvidenceBytes(claimId: string, index: number, dataUrl: string, token: string | null): Promise<StoredEvidence> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Screenshots must be images.');
  const name = `evidence-${index + 1}.jpg`;
  if (!token) return { name, path: dataUrl };
  const pathname = `claims/${claimId}/${name}`;
  await put(pathname, Buffer.from(match[2], 'base64'), {
    access: 'private',
    token,
    addRandomSuffix: false,
    contentType: match[1],
  });
  return { name, path: pathname };
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

async function persistClaim(claim: ServerClaim): Promise<void> {
  const token = blobToken();
  if (token) {
    await writeOneBlob(claim, token);
    return;
  }
  const claims = readAllFiles();
  const index = claims.findIndex((entry) => entry.id === claim.id);
  if (index >= 0) claims[index] = claim;
  else claims.unshift(claim);
  writeAllFiles(claims);
}

async function loadRecords(): Promise<ServerClaim[]> {
  const token = blobToken();
  if (token) return readAllBlob(token);
  return readAllFiles();
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

  const token = blobToken();
  const now = Date.now();
  const id = rid('c');
  const evidence: StoredEvidence[] = [];
  for (const [index, item] of uploads.entries()) {
    evidence.push(await storeEvidenceBytes(id, index, item.dataUrl, token));
  }

  const claim: ServerClaim = {
    id,
    authorName,
    authorId: input.authorId,
    originPlatform,
    originUsername,
    originUrl: typeof input.originUrl === 'string' ? input.originUrl.trim().slice(0, 500) : '',
    evidence,
    message: typeof input.message === 'string' ? input.message.trim().slice(0, 2000) : '',
    email: (input.email as string).trim(),
    payoutWallet: input.payoutWallet as string,
    balanceAtSubmit: typeof input.balanceAtSubmit === 'string' ? input.balanceAtSubmit.slice(0, 40) : '0',
    status: 'pending',
    questions: [],
    followups: [],
    detailTokens: [],
    approveTx: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!token && JSON.stringify(claim).length > MAX_PAYLOAD_BYTES) {
    throw new Error('Those screenshots are too large together. Remove a few and try again.');
  }

  await persistClaim(claim);
  return claim;
}

export async function listClaims(): Promise<ServerClaim[]> {
  return loadRecords();
}

export async function getClaim(id: string): Promise<ServerClaim | null> {
  const records = await loadRecords();
  return records.find((claim) => claim.id === id) ?? null;
}

export async function getClaimByToken(token: string): Promise<{ claim: ServerClaim; tokenIssuedAt: number } | null> {
  if (typeof token !== 'string' || !token) return null;
  const records = await loadRecords();
  const claim = records.find((entry) => entry.detailTokens.some((entry2) => entry2.token === token));
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

  const blob = blobToken();
  const claim = found.claim;
  const stored: StoredEvidence[] = [];
  const base = claim.evidence.length + claim.followups.reduce((count, entry) => count + entry.evidence.length, 0);
  for (const [index, item] of cleaned.entries()) {
    stored.push(await storeEvidenceBytes(claim.id, base + index, item.dataUrl, blob));
  }
  claim.followups.push({ message: text, evidence: stored, createdAt: Date.now() });
  claim.status = 'pending';
  claim.updatedAt = Date.now();
  await persistClaim(claim);
  return claim;
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
  for (const text of items) {
    claim.questions.push({ id: rid('q', 8), text, createdAt: now });
  }
  claim.detailTokens.push({ token, createdAt: now });
  claim.status = 'more-info';
  claim.updatedAt = now;
  await persistClaim(claim);
  return { token };
}

export async function setClaimStatus(id: string, status: ClaimStatus, approveTx: string | null): Promise<ServerClaim> {
  const claim = await getClaim(id);
  if (!claim) throw new Error('Claim not found.');
  claim.status = status;
  if (approveTx) claim.approveTx = approveTx;
  claim.updatedAt = Date.now();
  await persistClaim(claim);
  return claim;
}

export { deleteOneBlob };
