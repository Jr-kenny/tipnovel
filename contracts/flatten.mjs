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
    const direct = line.match(/^import\s+["']([^"']+)["'];/);
    const named = line.match(/^import\s+.*\sfrom\s+["']([^"']+)["'];/);
    const imported = direct ? direct[1] : named ? named[1] : null;
    if (imported) {
      const dep = imported.startsWith('@')
        ? require.resolve(imported, { paths: [dir] })
        : path.resolve(base, imported);
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
const body = inlineFile(path.join(dir, 'TipVault.sol'));
const flat = `${spdx.join('\n')}\n${pragma}\n${body}\n`;
mkdirSync(path.join(dir, 'out'), { recursive: true });
writeFileSync(path.join(dir, 'out', 'TipVaultFlat.sol'), flat);
console.log('Flattened TipVaultFlat.sol.');
