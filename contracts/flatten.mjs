/**
 * Flattens TipVault.sol (with OpenZeppelin imports inlined) into
 * out/TipVaultFlat.sol for explorers that prefer single-file verification.
 *
 * Run from contracts/:  node flatten.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const seen = new Set();
let pragma = '';
const spdx = [];

function inlineFile(file) {
  const content = readFileSync(file, 'utf8');
  const base = file.slice(0, file.lastIndexOf('/') + 1);
  const out = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^import\s+["']([^"']+)["'];/);
    if (match) {
      const dep = match[1].startsWith('@')
        ? require.resolve(match[1], { paths: [dir] })
        : path.resolve(base, match[1]);
      if (!seen.has(dep)) {
        seen.add(dep);
        out.push(inlineFile(dep));
      }
      continue;
    }
    if (line.startsWith('// SPDX')) {
      if (!spdx.includes(line)) spdx.push(line);
      continue;
    }
    if (line.startsWith('pragma solidity')) {
      if (!pragma) pragma = line;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

seen.add(path.join(dir, 'TipVault.sol'));
const flat = `${spdx.join('\n')}\n${pragma}\n${inlineFile(path.join(dir, 'TipVault.sol'))}\n`;
mkdirSync(path.join(dir, 'out'), { recursive: true });
writeFileSync(path.join(dir, 'out', 'TipVaultFlat.sol'), flat);
console.log('Flattened TipVaultFlat.sol.');
