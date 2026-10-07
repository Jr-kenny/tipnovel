import AsyncStorage from '@react-native-async-storage/async-storage';

export type ClaimRequest = {
  id: string;
  authorName: string;
  authorId: `0x${string}`;
  originPlatform: string;
  originUsername: string;
  originUrl: string;
  evidenceUris: string[];
  message: string;
  email: string;
  payoutWallet: string;
  balanceAtSubmit: string;
  status: 'pending' | 'approved';
  createdAt: number;
};

const CLAIMS_KEY = 'tipnovel.claims';

type StoredClaim = Omit<Partial<ClaimRequest>, 'authorId'> & {
  authorId: `0x${string}`;
  evidenceUri?: string;
  code?: string;
};

function normalize(raw: StoredClaim): ClaimRequest | null {
  if (!raw.id || !raw.authorId || !raw.authorName) return null;
  return {
    id: raw.id,
    authorName: raw.authorName,
    authorId: raw.authorId,
    originPlatform: raw.originPlatform ?? '',
    originUsername: raw.originUsername ?? '',
    originUrl: raw.originUrl ?? '',
    evidenceUris: raw.evidenceUris ?? (raw.evidenceUri ? [raw.evidenceUri] : []),
    message: raw.message ?? '',
    email: raw.email ?? '',
    payoutWallet: raw.payoutWallet ?? '',
    balanceAtSubmit: raw.balanceAtSubmit ?? '0',
    status: raw.status === 'approved' ? 'approved' : 'pending',
    createdAt: raw.createdAt ?? Date.now(),
  };
}

export async function loadClaims(): Promise<ClaimRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredClaim[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const claim = normalize(entry);
      return claim ? [claim] : [];
    });
  } catch {
    return [];
  }
}

async function persist(claims: ClaimRequest[]): Promise<ClaimRequest[]> {
  await AsyncStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
  return claims;
}

export async function saveClaim(claim: Omit<ClaimRequest, 'id' | 'status' | 'createdAt'>): Promise<ClaimRequest[]> {
  const current = await loadClaims();
  const entry: ClaimRequest = {
    ...claim,
    id: `${claim.authorId}-${Date.now()}`,
    status: 'pending',
    createdAt: Date.now(),
  };
  return persist([entry, ...current]);
}

export async function markClaimApproved(id: string): Promise<ClaimRequest[]> {
  const current = await loadClaims();
  return persist(current.map((claim) => (claim.id === id ? { ...claim, status: 'approved' } : claim)));
}
