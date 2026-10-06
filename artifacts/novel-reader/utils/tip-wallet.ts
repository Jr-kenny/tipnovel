import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
  type Hash,
} from 'viem';
import {
  ARC,
  ARC_EXPLORER_URL,
  ARC_RPC_URL,
  ERC20_ABI,
  TIP_VAULT_ADDRESS,
  USDC_ADDRESS,
  VAULT_ABI,
  VAULT_DEPLOYED,
  WALLET_CONNECT_PROJECT_ID,
} from './tip-chain';

export type TipFailure =
  | 'no-wallet'
  | 'not-configured'
  | 'rejected'
  | 'wrong-network'
  | 'low-balance'
  | 'failed';

export class TipError extends Error {
  readonly code: TipFailure;

  constructor(code: TipFailure, message: string) {
    super(message);
    this.code = code;
  }
}

export type AuthorStats = {
  deployed: boolean;
  balance: bigint;
  tippers: bigint;
  verified: boolean;
  wallet: Address | null;
};

export type WalletSession = {
  address: Address;
  chainId: number;
};

const WALLET_STORAGE_KEY = 'tipnovel.wallet.address';
const ARC_HEX_CHAIN_ID = `0x${ARC.id.toString(16)}`;

const publicClient = createPublicClient({ chain: ARC, transport: http(ARC_RPC_URL) });

let session: WalletSession | null = null;
const sessionListeners = new Set<() => void>();

function setSession(next: WalletSession | null) {
  session = next;
  sessionListeners.forEach((listener) => listener());
}

export function getWalletSession(): WalletSession | null {
  return session;
}

export function subscribeWalletSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function webProvider(): EIP1193Provider | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const provider = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return provider ?? null;
}

type UniversalProvider = import('@walletconnect/universal-provider').default;

let wcProvider: UniversalProvider | null = null;
let pairingUri: string | null = null;
const pairingListeners = new Set<() => void>();

export function getPairingUri(): string | null {
  return pairingUri;
}

export function subscribePairingUri(listener: () => void): () => void {
  pairingListeners.add(listener);
  return () => {
    pairingListeners.delete(listener);
  };
}

function setPairingUri(uri: string | null) {
  pairingUri = uri;
  pairingListeners.forEach((listener) => listener());
}

async function nativeProvider(): Promise<UniversalProvider> {
  if (!WALLET_CONNECT_PROJECT_ID) {
    throw new TipError('not-configured', 'WalletConnect is not set up in this build yet.');
  }
  if (!wcProvider) {
    const { default: UniversalProvider } = await import('@walletconnect/universal-provider');
    wcProvider = await UniversalProvider.init({
      projectId: WALLET_CONNECT_PROJECT_ID,
      metadata: {
        name: 'TipNovel',
        description: 'Tip the writers behind the stories.',
        url: 'https://github.com/Jr-kenny/tipnovel',
        icons: [],
      },
      storage: {
        getItem: async <T,>(key: string): Promise<T | undefined> =>
          ((await AsyncStorage.getItem(`tipnovel.wc:${key}`)) ?? undefined) as T | undefined,
        setItem: <T,>(key: string, value: T): Promise<void> =>
          AsyncStorage.setItem(`tipnovel.wc:${key}`, typeof value === 'string' ? value : JSON.stringify(value)),
        removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(`tipnovel.wc:${key}`),
        getKeys: async (): Promise<string[]> => {
          const keys = await AsyncStorage.getAllKeys();
          return keys.filter((key) => key.startsWith('tipnovel.wc:')).map((key) => key.slice('tipnovel.wc:'.length));
        },
      },
    });
    wcProvider.on('display_uri', (uri: string) => setPairingUri(uri));
    wcProvider.on('session_delete', () => {
      setSession(null);
      setPairingUri(null);
    });
  }
  return wcProvider;
}

function parseChainId(value: unknown): number {
  if (typeof value === 'string') return Number.parseInt(value, 16);
  if (typeof value === 'number') return value;
  return Number.NaN;
}

function isRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { code?: unknown; message?: unknown };
  if (record.code === 4001) return true;
  return typeof record.message === 'string' && /rejected|cancelled|denied/i.test(record.message);
}

export async function connectWallet(): Promise<WalletSession> {
  if (Platform.OS === 'web') {
    const provider = webProvider();
    if (!provider) {
      throw new TipError('no-wallet', 'No browser wallet found. Install one to continue.');
    }
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
      if (!accounts[0]) throw new TipError('failed', 'The wallet returned no account.');
      const next = { address: accounts[0] as Address, chainId };
      setSession(next);
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, next.address);
      return next;
    } catch (error) {
      if (error instanceof TipError) throw error;
      throw new TipError('rejected', 'Connection request was dismissed. Try again when ready.');
    }
  }

  const provider = await nativeProvider();
  try {
    if (!provider.session) {
      setPairingUri(null);
      await provider.connect({
        namespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign'],
            chains: [`eip155:${ARC.id}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });
    }
    const accounts = provider.session?.namespaces.eip155?.accounts ?? [];
    const parts = accounts[0]?.split(':');
    const address = parts?.[2];
    if (!address) throw new TipError('failed', 'The wallet returned no account.');
    const next = { address: address as Address, chainId: parts?.[1] ? Number.parseInt(parts[1], 10) : ARC.id };
    setSession(next);
    setPairingUri(null);
    await AsyncStorage.setItem(WALLET_STORAGE_KEY, next.address);
    return next;
  } catch (error) {
    if (error instanceof TipError) throw error;
    if (isRejection(error)) throw new TipError('rejected', 'Connection request was dismissed. Try again when ready.');
    throw new TipError('failed', 'Could not reach the wallet. Try again.');
  }
}

export async function restoreWalletSession(): Promise<WalletSession | null> {
  try {
    if (Platform.OS === 'web') {
      const provider = webProvider();
      if (!provider) return null;
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      if (!accounts[0]) return null;
      const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
      const next = { address: accounts[0] as Address, chainId };
      setSession(next);
      return next;
    }
    if (wcProvider?.session) {
      const accounts = wcProvider.session.namespaces.eip155?.accounts ?? [];
      const parts = accounts[0]?.split(':');
      const address = parts?.[2];
      if (!address) return null;
      const next = { address: address as Address, chainId: parts?.[1] ? Number.parseInt(parts[1], 10) : ARC.id };
      setSession(next);
      return next;
    }
    return null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  try {
    await wcProvider?.disconnect();
  } catch {
    // Clearing local state is enough if the relay is unreachable.
  }
  wcProvider = null;
  setPairingUri(null);
  setSession(null);
  await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
}

export async function ensureArcNetwork(): Promise<void> {
  const active = session;
  if (active && active.chainId === ARC.id) return;
  if (Platform.OS !== 'web') {
    throw new TipError('wrong-network', 'Switch to the Arc network in your wallet, then try again.');
  }
  const provider = webProvider();
  if (!provider) throw new TipError('no-wallet', 'No browser wallet found. Install one to continue.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_HEX_CHAIN_ID }] });
  } catch (switchError) {
    const code = (switchError as { code?: number })?.code;
    if (code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_HEX_CHAIN_ID,
            chainName: 'Arc',
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
            rpcUrls: [ARC_RPC_URL],
            blockExplorerUrls: [ARC_EXPLORER_URL],
          }],
        });
      } catch (addError) {
        if (isRejection(addError)) throw new TipError('rejected', 'Network request was dismissed. Try again when ready.');
        throw new TipError('wrong-network', 'Arc could not be added. Add it manually, then try again.');
      }
    } else if (isRejection(switchError)) {
      throw new TipError('rejected', 'Network request was dismissed. Try again when ready.');
    } else {
      throw new TipError('wrong-network', 'Switch to the Arc network in your wallet, then try again.');
    }
  }
  const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
  if (chainId !== ARC.id) {
    throw new TipError('wrong-network', 'This wallet is still on another network. Switch to Arc, then try again.');
  }
  if (active) setSession({ ...active, chainId });
}

export async function readUsdcBalance(address: Address): Promise<bigint> {
  return publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
}

export async function verifyAuthor(authorId: `0x${string}`, wallet: Address): Promise<Hash> {
  if (!VAULT_DEPLOYED) throw new TipError('failed', 'Tipping is not live yet. Check back soon.');
  const active = session;
  if (!active) throw new TipError('no-wallet', 'Connect the owner wallet to review claims.');
  const provider = Platform.OS === 'web' ? webProvider() : wcProvider;
  if (!provider) throw new TipError('no-wallet', 'Connect the owner wallet to review claims.');
  const walletClient = createWalletClient({
    chain: ARC,
    transport: custom(provider as unknown as EIP1193Provider),
    account: active.address,
  });
  try {
    const hash = await walletClient.writeContract({
      address: TIP_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'verifyAuthor',
      args: [authorId, wallet],
      chain: ARC,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (error) {
    if (error instanceof TipError) throw error;
    if (isRejection(error)) throw new TipError('rejected', 'Signature request was dismissed. Nothing was sent.');
    throw new TipError('failed', 'Verification failed. Nothing was sent.');
  }
}

export async function readAuthorStats(authorId: `0x${string}`): Promise<AuthorStats> {
  if (!VAULT_DEPLOYED) {
    return { deployed: false, balance: 0n, tippers: 0n, verified: false, wallet: null };
  }
  try {
    const [balance, tippers, verified, wallet] = await publicClient.readContract({
      address: TIP_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'stats',
      args: [authorId],
    });
    return { deployed: true, balance, tippers, verified, wallet: wallet === '0x0000000000000000000000000000000000000000' ? null : wallet };
  } catch {
    throw new TipError('failed', 'Author totals are unavailable right now. Try again.');
  }
}

export async function sendTip(
  authorId: `0x${string}`,
  amount: bigint,
  memo: string,
  onProgress?: (stage: 'approve' | 'tip') => void,
): Promise<Hash> {
  if (!VAULT_DEPLOYED) throw new TipError('failed', 'Tipping is not live yet. Check back soon.');
  const active = session;
  if (!active) throw new TipError('no-wallet', 'Connect a wallet to send a tip.');
  if (amount <= 0n) throw new TipError('failed', 'Enter an amount above zero.');

  const provider = Platform.OS === 'web' ? webProvider() : wcProvider;
  if (!provider) throw new TipError('no-wallet', 'Connect a wallet to send a tip.');
  const walletClient = createWalletClient({
    chain: ARC,
    transport: custom(provider as unknown as EIP1193Provider),
    account: active.address,
  });

  const balance = await readUsdcBalance(active.address).catch(() => {
    throw new TipError('failed', 'The balance could not be read. Try again.');
  });
  if (balance < amount) {
    throw new TipError('low-balance', 'Not enough USDC for this tip.');
  }

  try {
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [active.address, TIP_VAULT_ADDRESS],
    });
    if (allowance < amount) {
      onProgress?.('approve');
      const approveHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TIP_VAULT_ADDRESS, amount],
        chain: ARC,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
    onProgress?.('tip');
    const tipHash = await walletClient.writeContract({
      address: TIP_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'tip',
      args: [authorId, amount, memo.slice(0, 120)],
      chain: ARC,
    });
    await publicClient.waitForTransactionReceipt({ hash: tipHash });
    return tipHash;
  } catch (error) {
    if (error instanceof TipError) throw error;
    if (isRejection(error)) throw new TipError('rejected', 'Signature request was dismissed. Nothing was sent.');
    const message = error instanceof Error ? error.message : '';
    if (/network|chain/i.test(message)) {
      throw new TipError('wrong-network', 'This wallet is on another network. Switch to Arc, then try again.');
    }
    throw new TipError('failed', 'The transaction failed. Nothing was sent.');
  }
}
