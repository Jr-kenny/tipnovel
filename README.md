# TipNovel

TipNovel is a calm reading app where every book carries a direct line to its
writer. Discover, organize, download, and read novels — and when a story earns
it, tip the author in seconds.

## Why tipping belongs in the reader

Free reading apps run on writers' work, yet writers see nothing from them.
TipNovel adds a tipping layer instead of a paywall: reading stays free, and
any reader can send USDC directly to the writer of the book in front of them.
Writers never have to publish here. They keep writing wherever their readers
are, and tips wait safely until they claim them.

## How it works

1. Read anything, no wallet needed.
2. Tap Tip in the reader. The app reads the author from the book's metadata,
   shows how many readers tipped them, and offers 0.1, 2, and 5 USDC presets
   plus any custom amount.
3. Connect a wallet only at that moment, approve the exact amount, and send.
   Tips settle in USDC on Arc in under a second.
4. Writers open the Claim page, prove authorship with a one-time code placed
   in their original bio or dashboard, and register a payout wallet.
5. After manual review, the payout wallet is whitelisted and the writer
   withdraws. Unclaimed tips stay visibly locked under a "waiting for the
   author" status — never spent, never hidden.

## Product focus

- Discover novels through the built-in catalogue.
- Search, save, favorite, and organize novels in the library.
- Browse chapters, resume from the saved position, and track reading history.
- Download chapters for offline reading.
- Customize text size, line height, paragraph spacing, indentation, margins,
  fonts, themes, and navigation.
- Read vertically through a chapter or use horizontal page navigation.
- Tip authors in USDC on Arc; writers claim and withdraw without publishing here.

## Project structure

The mobile application is located at:

```text
artifacts/novel-reader
```

Important areas include:

- `app/` for Expo Router screens and navigation.
- `components/` for shared native UI components, including the tip sheet.
- `context/` for app, catalogue, and reader state.
- `utils/` for chain configuration, wallet session handling, and tipping logic.
- `contracts/` for the TipVault tipping contract deployed on Arc.

## Development

Install dependencies from the repository root:

```bash
pnpm install
```

Run the shared app in a browser:

```bash
cd artifacts/novel-reader
pnpm exec expo start --web
```

Run the native Expo app from the mobile app directory:

```bash
cd artifacts/novel-reader
pnpm exec expo start
```

Useful checks:

```bash
pnpm run typecheck
pnpm --filter @workspace/novel-reader exec expo export --platform web
```

The production web build is configured in [`vercel.json`](vercel.json). It
exports `artifacts/novel-reader/dist` and uses the same app routes and state
as the native application.

The app is being developed for mobile first. The website is the shared
browser build, not a separate product implementation.
