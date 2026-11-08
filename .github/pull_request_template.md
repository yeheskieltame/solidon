<!--
Solidon PR template. Every required section must be filled before merge.
Author, assignee, and reviewer: @yeheskieltame (see CONTRIBUTING.md section 1).
-->

## Summary

<!-- One or two sentences: what this PR does and why. -->

Closes #

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Finding fix (security / economic)
- [ ] Refactor
- [ ] Docs / chore

## Severity and area

- **Severity of the problem fixed:** S0 Critical / S1 High / S2 Medium / S3 Low / n/a (feature)
- **Area:** factory / meme / pool / mnav / chainsig / intents / oracle / relayer / keeper / web / sim / docs
- **Track:** defi / memecoins

## Finding

<!-- What was observed, where (file, function, page, tx), and how it was discovered (test, manual QA, simulation, review). -->

## Root cause

<!-- Why it happened. Point to the exact code or assumption. -->

## Why this fix

<!-- Why this approach. List the alternatives considered and why they were rejected. -->

## Changes

<!-- Bullet list of the concrete changes. -->

-

## Before / After (required)

<!-- UI: screenshots at the same viewport. Contracts: test output. On-chain: tx links. Economics: simulation output. -->

| Before | After |
| --- | --- |
| <!-- screenshot / output / tx link --> | <!-- screenshot / output / tx link --> |

## How to test

<!-- Steps a judge or AI screener can repeat. Format: do X, see Y. -->

1. Do … → see …
2. Do … → see …

## On-chain impact

- **Network:** testnet / mainnet / none
- **Contracts touched:**
- **Transactions:** <!-- NearBlocks / BscScan / Intents explorer links -->
- **Storage or gas change:**

## Risk and rollback

- **What could break:**
- **Rollback:** <!-- revert commit, redeploy previous version, pause flag, etc. -->

## Checklist

- [ ] Linked issue and `Closes #<n>` above
- [ ] Tests added or updated, and passing
- [ ] Before / After evidence attached
- [ ] No secrets, private keys, or `.env` content in the diff
- [ ] `README.md` / `docs/SPEC.md` updated if behaviour or parameters changed
- [ ] Contract addresses taken from official sources and linked
- [ ] Commits authored by `yeheskieltame`, no extra `Co-authored-by` trailers
- [ ] Assignee and reviewer: @yeheskieltame
