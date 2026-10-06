import { keccak256, stringToHex } from 'viem';
import { arcTestnet } from 'viem/chains';

export const ARC = arcTestnet;
export const ARC_RPC_URL = 'https://rpc.testnet.arc.io';
export const ARC_EXPLORER_URL = 'https://testnet.arcscan.app';

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
export const USDC_DECIMALS = 6;

const UNDEPLOYED_ADDRESS = '0x0000000000000000000000000000000000000000';
export const TIP_VAULT_ADDRESS = '0x88c1726b506ac43cdc14d9b8aa229c7d342c5a15' as const;
export const VAULT_DEPLOYED = (TIP_VAULT_ADDRESS as string) !== UNDEPLOYED_ADDRESS;

export const TIP_PRESETS = [0.1, 2, 5] as const;

export const WALLET_CONNECT_PROJECT_ID = '';

export const OWNER_ADDRESS: string = '0x23f060eBE21CB48d7bd0F2b63fd814fe65514AaE';

export const VAULT_ABI = [
  {
    type: 'function',
    name: 'tip',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'authorId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stats',
    stateMutability: 'view',
    inputs: [{ name: 'authorId', type: 'bytes32' }],
    outputs: [
      { name: 'balance', type: 'uint256' },
      { name: 'tippers', type: 'uint256' },
      { name: 'isVerified', type: 'bool' },
      { name: 'wallet', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'verifyAuthor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'authorId', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'authorId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export function usableAuthorName(author: string | undefined | null): string | null {
  const name = (author ?? '').trim().replace(/\s+/g, ' ');
  return name.length > 0 ? name : null;
}

export function authorIdFor(authorName: string, sourceId: string): `0x${string}` {
  const key = `${authorName.trim().replace(/\s+/g, ' ').toLowerCase()}\n${(sourceId ?? '').trim().toLowerCase()}`;
  return keccak256(stringToHex(key));
}

export function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
