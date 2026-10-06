# TipNovel — Arc Microgrants Hackathon Clone

This is a **web-reader-only demo clone** of Prime Novel for the
[Arc Microgrants (Circle) hackathon](https://dorahacks.io/hackathon/arc-microgrants/detail).
Prime Novel stays untouched. All tipping experiments live here.

Vision: open-source readers benefit from writers' work. TipNovel adds a USDC
tipping layer on Arc so any writer earns even if they never publish with us.

## How it works (PoC)

1. User funds in-app wallet with USDC on Arc (gas also paid in USDC).
2. User reads any book normally. App reads metadata (title, writer) -> `authorId = keccak256(normalized_name + source)`.
3. User taps Tip -> `TipNovelVault.tip(authorId, amount)` in USDC. Thousands can tip same authorId.
4. Tips pool in one vault contract (no wallet-per-writer).
5. Writer visits claim page, sees unclaimed balance, submits proof + payout wallet.
6. Admin does manual verification -> `verifyAuthor(authorId, wallet)` -> writer calls `withdraw()`.

## Web-only demo scope

For the grant submission we only need the **Expo web build** (`artifacts/novel-reader` -> web export).
Native iOS/Android builds are out of scope to save time/data.

## Run entirely in Codespace (saves mobile data)

1. Open this repo in GitHub Codespace (all `pnpm install` runs on GitHub servers).
2. Wait for `postCreateCommand` to finish (`pnpm install`).
3. Run web demo:
```bash
cd artifacts/novel-reader
pnpm exec expo start --web
# or production export:
pnpm exec expo export --platform web
```
4. Deploy contract to Arc mainnet (from Codespace):
```bash
cd contracts
# needs Foundry + ARC_RPC_URL + PRIVATE_KEY + USDC address in env
forge create TipVault --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --constructor-args $USDC_ADDRESS $OWNER
```

## Submission checklist (Arc Microgrants)

- [ ] Live deployment on Arc mainnet (web URL we can open)
- [ ] Public repo (this one)
- [ ] Short description + what it uses Arc for (USDC tips + gas)
- [ ] Public builder profile (GitHub/X/Farcaster)
- [ ] Vault contract address + demo video

Deadline: Oct 14, 2026 23:59 ET. Reviews rolling, decisions by Oct 21.
