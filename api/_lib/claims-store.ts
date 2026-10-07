import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export type StoredEvidence = {
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

function dataDir(): string {
  const configured = process.env.CLAIMS_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return '/tmp/tipnovel-claims';
  return path.resolve(process.cwd(), 'data-claims');
}

function filePath(): string {
  return path.join(dataDir(), 'claims.json');
}

function readAll(): ServerClaim[] {
  try {
    const raw = readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw) as ServerClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(claims: ServerClaim[]): void {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(claims));
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

function cleanEvidence(value: unknown): StoredEvidence[] | null {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_ITEMS) return null;
  const items: StoredEvidence[] = [];
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

export function createClaim(input: Record<string, unknown>): ServerClaim {
  const authorName = typeof input.authorName === 'string' ? input.authorName.trim() : '';
  const originPlatform = typeof input.originPlatform === 'string' ? input.originPlatform.trim() : '';
  const originUsername = typeof input.originUsername === 'string' ? input.originUsername.trim() : '';
  if (!authorName) throw new Error('An author name is required.');
  if (!isAuthorId(input.authorId)) throw new Error('The author record is invalid.');
  if (!originPlatform) throw new Error('Name the place the novel was first uploaded.');
  if (!originUsername) throw new Error('Add the username on that platform.');
  const evidence = cleanEvidence(input.evidence);
  if (!evidence || evidence.length === 0) throw new Error('Attach at least one dashboard screenshot.');
  if (!isEmail(input.email)) throw new Error('Add an email where the review outcome can reach you.');
  if (!isHexAddress(input.payoutWallet)) throw new Error('That payout wallet address does not look right.');

  const now = Date.now();
  const claim: ServerClaim = {
    id: rid('c'),
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

  if (JSON.stringify(claim).length > MAX_PAYLOAD_BYTES) {
    throw new Error('Those screenshots are too large together. Remove a few and try again.');
  }

  const claims = readAll();
  claims.unshift(claim);
  writeAll(claims);
  return claim;
}

export function listClaims(): ServerClaim[] {
  return readAll();
}

export function getClaim(id: string): ServerClaim | null {
  return readAll().find((claim) => claim.id === id) ?? null;
}

export function getClaimByToken(token: string): { claim: ServerClaim; tokenIssuedAt: number } | null {
  if (typeof token !== 'string' || !token) return null;
  const claim = readAll().find((entry) => entry.detailTokens.some((entry2) => entry2.token === token));
  if (!claim) return null;
  const record = claim.detailTokens.find((entry) => entry.token === token);
  return { claim, tokenIssuedAt: record?.createdAt ?? claim.updatedAt };
}

export function addFollowup(token: string, message: string, evidence: unknown): ServerClaim {
  const found = getClaimByToken(token);
  if (!found) throw new Error('This follow-up link is invalid.');
  const items = cleanEvidence(evidence) ?? [];
  if (items.length > MAX_EVIDENCE_ITEMS) throw new Error('Attach at most ten screenshots.');
  const text = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
  if (!text && items.length === 0) throw new Error('Write a reply or attach screenshots.');
  const claims = readAll();
  const claim = claims.find((entry) => entry.id === found.claim.id);
  if (!claim) throw new Error('This follow-up link is invalid.');
  claim.followups.push({ message: text, evidence: items, createdAt: Date.now() });
  claim.status = 'pending';
  claim.updatedAt = Date.now();
  if (JSON.stringify(claim).length > MAX_PAYLOAD_BYTES) {
    throw new Error('Those screenshots are too large together. Remove a few and try again.');
  }
  writeAll(claims);
  return claim;
}

export function requestDetails(id: string, questions: unknown): { token: string } {
  const items = Array.isArray(questions)
    ? questions.filter((question): question is string => typeof question === 'string' && question.trim().length > 0)
        .map((question) => question.trim().slice(0, 500))
    : [];
  if (items.length === 0) throw new Error('Write at least one question.');
  const claims = readAll();
  const claim = claims.find((entry) => entry.id === id);
  if (!claim) throw new Error('Claim not found.');
  const token = rid('t', 24);
  const now = Date.now();
  for (const text of items) {
    claim.questions.push({ id: rid('q', 8), text, createdAt: now });
  }
  claim.detailTokens.push({ token, createdAt: now });
  claim.status = 'more-info';
  claim.updatedAt = now;
  writeAll(claims);
  return { token };
}

export function setClaimStatus(id: string, status: ClaimStatus, approveTx: string | null): ServerClaim {
  const claims = readAll();
  const claim = claims.find((entry) => entry.id === id);
  if (!claim) throw new Error('Claim not found.');
  claim.status = status;
  if (approveTx) claim.approveTx = approveTx;
  claim.updatedAt = Date.now();
  writeAll(claims);
  return claim;
}
