/**
 * Compiles contracts/TipVault.sol with solc 0.8.24 and writes out/TipVault.json
 * containing the ABI and bytecode used by deploy.mjs and the app.
 *
 * Run from contracts/:  npm run compile
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const source = readFileSync(path.join(dir, 'TipVault.sol'), 'utf8');

function findImports(importPath) {
  try {
    const resolved = importPath.startsWith('@')
      ? require.resolve(importPath, { paths: [dir] })
      : path.resolve(dir, importPath);
    return { contents: readFileSync(resolved, 'utf8') };
  } catch (error) {
    return { error: `Import not found: ${importPath}` };
  }
}

const stdJsonInput = {
  language: 'Solidity',
  sources: { 'TipVault.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(stdJsonInput), { import: findImports }),
);
const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error');
if (errors.length > 0) {
  for (const entry of errors) console.error(entry.formattedMessage ?? entry.message);
  process.exit(1);
}

const contract = output.contracts?.['TipVault.sol']?.TipNovelVault;
if (!contract?.evm?.bytecode?.object) {
  console.error('Compilation produced no bytecode.');
  process.exit(1);
}

mkdirSync(path.join(dir, 'out'), { recursive: true });
writeFileSync(
  path.join(dir, 'out', 'TipVault.json'),
  JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2),
);

// Full standard JSON with every source embedded, for manual explorer verification.
const embedded = new Map([['TipVault.sol', source]]);
function recordImports(importPath) {
  try {
    const resolved = importPath.startsWith('@')
      ? require.resolve(importPath, { paths: [dir] })
      : path.resolve(dir, importPath);
    const contents = readFileSync(resolved, 'utf8');
    embedded.set(importPath, contents);
    return { contents };
  } catch (error) {
    return { error: `Import not found: ${importPath}` };
  }
}
solc.compile(
  JSON.stringify({
    language: 'Solidity',
    sources: { 'TipVault.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': [] } } },
  }),
  { import: recordImports },
);
writeFileSync(
  path.join(dir, 'out', 'standard-json.json'),
  JSON.stringify({
    language: 'Solidity',
    sources: Object.fromEntries([...embedded.entries()].map(([name, content]) => [name, { content }])),
    settings: { optimizer: { enabled: true, runs: 200 } },
  }),
);
console.log('Compiled TipNovelVault.');
