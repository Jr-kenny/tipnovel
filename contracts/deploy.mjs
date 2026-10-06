/**
 * Deploys TipNovelVault to Arc and prints the address plus verification reads.
 *
 *   NETWORK=testnet DEPLOYER_KEY=0x... OWNER_ADDRESS=0x... npm run deploy
 *
 * NETWORK is testnet by default. Set NETWORK=mainnet for the real deployment.
 * DEPLOYER_KEY funds gas (USDC on Arc); testnet USDC comes from the Circle
 * faucet. The key is read from the environment and never written anywhere.
 *
 * Run from contracts/ after:  npm run compile
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const dir = path.dirname(fileURLToPath(import.meta.url));

const NETWORKS = {
  testnet: {
    id: 5042002,
    name: 'Arc Testnet',
    rpc: 'https://rpc.testnet.arc.io',
    explorer: 'https://testnet.arcscan.app',
  },
  mainnet: {
    id: 5042,
    name: 'Arc',
    rpc: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
  },
};

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';

const network = NETWORKS[process.env.NETWORK] ?? NETWORKS.testnet;
const deployerKey = process.env.DEPLOYER_KEY;
const ownerAddress = process.env.OWNER_ADDRESS;

if (!deployerKey || !/^0x[0-9a-fA-F]{64}$/.test(deployerKey.trim())) {
  console.error('Set DEPLOYER_KEY to the deployer hex private key.');
  process.exit(1);
}
if (!ownerAddress || !/^0x[0-9a-fA-F]{40}$/.test(ownerAddress.trim())) {
  console.error('Set OWNER_ADDRESS to the whitelist owner wallet.');
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(path.join(dir, 'out', 'TipVault.json'), 'utf8'));
const account = privateKeyToAccount(deployerKey.trim());

const publicClient = createPublicClient({
  chain: {
    id: network.id,
    name: network.name,
    nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
    rpcUrls: { default: { http: [network.rpc] } },
  },
  transport: http(network.rpc),
});

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer ${account.address} holds ${balance.toString()} base units.`);
if (balance === 0n) {
  console.error('Deployer has no USDC for gas. Fund it first, then rerun.');
  process.exit(1);
}

const walletClient = createWalletClient({
  account,
  chain: publicClient.chain,
  transport: http(network.rpc),
});

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [USDC_ADDRESS, ownerAddress.trim()],
});
console.log(`Deploy sent: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) {
  console.error('Deploy transaction produced no contract address.');
  process.exit(1);
}

console.log(`TipNovelVault live at ${receipt.contractAddress}`);
console.log(`${network.explorer}/address/${receipt.contractAddress}`);

const [owner, usdc] = await Promise.all([
  publicClient.readContract({ address: receipt.contractAddress, abi: artifact.abi, functionName: 'owner' }),
  publicClient.readContract({ address: receipt.contractAddress, abi: artifact.abi, functionName: 'usdc' }),
]);
console.log(`owner() = ${owner}`);
console.log(`usdc() = ${usdc}`);
