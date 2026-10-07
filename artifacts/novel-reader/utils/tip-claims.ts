import AsyncStorage from '@react-native-async-storage/async-storage';

export type ClaimRequest = {
  id: string;
  authorName: string;
  authorId: `0x${string}`;
  originPlatform: string;
  originUsername: string;
  originUrl: string;
  evidenceUri: string;
  payoutWallet: string;
  balanceAtSubmit: string;
  status: 'pending' | 'approved';
  createdAt: number;
};

const CLAIMS_KEY = 'tipnovel.claims';

export async function loadClaims(): Promise<ClaimRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClaimRequest[];
    return Array.isArray(parsed) ? parsed : [];
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
