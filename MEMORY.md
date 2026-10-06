# TipNovel — standing instructions

Durable rules for every change in this repo. New work must follow these
without being reminded.

## Product identity

- This repo is TipNovel, a standalone product. Never reference Prime Novel,
  past work, or the fork history in user-visible copy, docs, or the README.
- User-visible strings say TipNovel. Internal type names may stay as-is unless
  a rename is risk-free; never churn internals for cosmetics.
- README.md is the product document: what TipNovel is, why it exists, how
  tipping works. Internal checklists, personal notes, and submission plumbing
  never go in public docs.

## Commit discipline

- Commit small and often: one commit per file or per focused change.
- Tens of commits per feature is normal. Never batch a feature into one commit.
- Messages are short, imperative, and specific.

## Reader UI

- The reader is calm and precise. New controls must match existing spacing,
  type scale, palette tokens, and Feather iconography exactly.
- Tip entry lives in the reader chrome (top bar) and as a soft end-of-chapter
  prompt. Never interrupt mid-chapter. Never add oversized buttons.
- If a book has no usable author in metadata, disable tipping. Never guess.

## Tipping and wallets

- Readers never need a wallet to read. Wallet UI appears only inside the tip
  flow and nowhere else.
- Amount presets are 0.1, 2, and 5 USDC plus a custom field with no minimum.
- Approve exact tip amounts only, never unlimited allowances.
- Show "waiting for the author" status for unclaimed tips. Unclaimed tips must
  feel safe, never risky.
- Confirm the on-chain Tipped event before updating any counter or history.
- Errors are one plain sentence each: rejected, wrong network, low balance,
  failed transaction. No jargon.

## Copy

- UI copy and docs are short. No verbose or obvious statements.
