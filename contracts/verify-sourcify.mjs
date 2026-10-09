/**
 * Verifies TipNovelVault source on Sourcify (which Arc's explorer picks up).
 *
 *   NETWORK=testnet node verify-sourcify.mjs
 *   NETWORK=mainnet node verify-sourcify.mjs   (default: mainnet)
 *
 * Reads the deployed address and creation tx from deployed-<network>.json and
 * rebuilds the exact solc standard-JSON input used by compile.mjs.
 *
 * Run from contracts/.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import solc from 'solc';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const network = process.env.NETWORK?.trim() || 'mainnet';
const chainId = network === 'testnet' ? 5042002 : 5042;

const record = JSON.parse(readFileSync(path.join(dir, `deployed-${network}.json`), 'utf8'));
const address = record.address;
const creationTransactionHash = record.deployTx;
if (!address || !creationTransactionHash) {
  console.error(`deployed-${network}.json is missing the address or deploy tx.`);
  process.exit(1);
}

async function alreadyVerified() {
  const response = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=status`);
  if (!response.ok) return false;
  const payload = await response.json();
  const status = payload?.status ?? payload?.[0]?.status;
  return status === 'perfect' || status === 'partial';
}

if (await alreadyVerified()) {
  console.log(`Already verified on Sourcify (${network}).`);
  process.exit(0);
}

const recorded = new Map();
function findImports(importPath) {
  try {
    const resolved = importPath.startsWith('@')
      ? require.resolve(importPath, { paths: [dir] })
      : path.resolve(dir, importPath);
    const contents = readFileSync(resolved, 'utf8');
    recorded.set(importPath, contents);
    return { contents };
  } catch (error) {
    return { error: `Import not found: ${importPath}` };
  }
}

const source = readFileSync(path.join(dir, 'TipVault.sol'), 'utf8');
recorded.set('TipVault.sol', source);

// Trigger the import callback for every transitive import.
JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources: { 'TipVault.sol': { content: source } },
      settings: { outputSelection: { '*': { '*': [] } } },
    }),
    { import: findImports },
  ),
);

const stdJsonInput = {
  language: 'Solidity',
  sources: Object.fromEntries([...recorded.entries()].map(([name, content]) => [name, { content }])),
  settings: { optimizer: { enabled: true, runs: 200 } },
};

const compilerVersion = solc.version();
console.log(`Submitting ${address} on chain ${chainId} with ${compilerVersion} ...`);

const submit = await fetch(`https://sourcify.dev/server/v2/verify/${chainId}/${address}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stdJsonInput,
    compilerVersion,
    contractIdentifier: 'TipVault.sol:TipNovelVault',
    creationTransactionHash,
  }),
});
const result = await submit.json();
if (!submit.ok || !result.verificationId) {
  console.error(`Submit failed: ${JSON.stringify(result).slice(0, 500)}`);
  process.exit(1);
}

for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const statusResponse = await fetch(`https://sourcify.dev/server/v2/verify/${result.verificationId}`);
  const status = await statusResponse.json();
  const job = status?.job ?? status;
  if (job?.status === 'verifying') continue;
  console.log(JSON.stringify(status).slice(0, 800));
  if (job?.status === 'finished' || status?.status === 'perfect' || status?.status === 'partial') {
    console.log(`Verified on Sourcify (${network}).`);
    process.exit(0);
  }
  console.error('Verification did not finish cleanly.');
  process.exit(1);
}
console.error('Verification timed out waiting for Sourcify.');
process.exit(1);
