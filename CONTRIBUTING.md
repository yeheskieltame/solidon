# Contributing to Solidon

This document is the working agreement for every change in this repository: issues, branches, commits, pull requests, evidence, and severity. Every change follows it, including changes written with AI coding agents.

## 1. GitHub identity: @yeheskieltame (mandatory)

Solidon is a solo project submitted with team size `1`. Every visible GitHub activity must come from **[@yeheskieltame](https://github.com/yeheskieltame)**.

| Activity | Rule |
| --- | --- |
| Repository owner | `yeheskieltame` |
| Commit author and committer | `yeheskieltame` only |
| Issue author and assignee | `@yeheskieltame` |
| Pull request author, assignee, and reviewer | `@yeheskieltame` |
| Code owner | `@yeheskieltame` for every path (see `.github/CODEOWNERS`) |
| Mentions in docs, templates, release notes | `@yeheskieltame` |

Set the local Git identity before the first commit:

```bash
git config user.name "yeheskieltame"
git config user.email "<the email registered on the @yeheskieltame GitHub account>"
git config --get user.name   # must print: yeheskieltame
```

Rules for AI coding agents (Claude Code, Codex, others):

- Agents commit with the identity above. They never use their own name, a bot account, or another person's account.
- Do not add `Co-authored-by:` trailers that add contributors. A second contributor in the repo contradicts the team size in the submission.
- AI tooling is disclosed in the README section "Tools & disclosure", as hackathon rule Q-005 requires. That is where AI usage is credited, not in commit authorship.

## 2. Language

- Everything in this repository is written in **English**: code, comments, commit messages, issues, pull requests, the README, and every document under `docs/`. Judges and AI screeners read all of it.

## 3. Branches and tags

| Branch | Purpose |
| --- | --- |
| `main` | Always demo-ready. Changes land only through pull requests |
| `feat/<area>-<short-name>` | New feature, e.g. `feat/chainsig-bsc-swap` |
| `fix/<area>-<short-name>` | Bug fix |
| `chore/`, `docs/`, `test/`, `refactor/` | Non-feature work |

Areas: `factory`, `meme`, `pool`, `mnav`, `chainsig`, `intents`, `oracle`, `relayer`, `keeper`, `web`, `sim`, `docs`, `ci`.

Hackathon tags (rule Q-003):

- No `pre-hackathon` tag: the repo was created inside the window and contains no earlier code.
- `hackathon-submission`: the commit submitted to judges.
- The README states that the full history was written during the hackathon.

## 4. Commits

Conventional Commits with an area scope:

```
<type>(<area>): <imperative summary, max 72 chars>

<why the change was needed, what it changes>

Refs #<issue>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `security`.

Example: `fix(mnav): stop buyback when the Pyth feed is older than 15 minutes`

## 5. Issues

Every piece of work starts from an issue. Use the templates in `.github/ISSUE_TEMPLATE/`:

| Template | Use it for |
| --- | --- |
| Bug report | Something works differently from the spec |
| Feature request | New capability or scope change |
| Finding | Security, economic, or research finding (exploit path, wrong math, risky assumption) |

Each issue is assigned to `@yeheskieltame`, gets one `severity:*` label, one `area:*` label, and one `type:*` label.

## 6. Severity levels

Severity measures **impact**. It decides the order of work during the hackathon window.

| Level | Label | Definition | Examples | Response in the hackathon window |
| --- | --- | --- | --- | --- |
| S0 Critical | `severity:critical` | Funds can be lost or stolen, treasury control broken, or the submission is blocked | Treasury signs a tx to a non-whitelisted contract; redeem pays more than the pro-rata share; repo not public near deadline | Stop all other work, fix now |
| S1 High | `severity:high` | Core flow broken or wrong economic action, no direct fund loss | mNAV triggers issuance on a stale price; Chain Signatures tx fails; demo flow cannot complete | Fix the same day |
| S2 Medium | `severity:medium` | Feature degraded, workaround exists | Dashboard shows a stale NAV; Intents deposit status not refreshed | Fix before submission if time allows |
| S3 Low | `severity:low` | Cosmetic, copy, minor UX | Misaligned card, typo, missing tooltip | Batch into polish |

Likelihood (for findings): `likely`, `possible`, `unlikely`. Report both impact and likelihood.

## 7. Pull requests

One pull request closes one issue. The template in `.github/pull_request_template.md` is mandatory, and a PR is not merged until every required section is filled.

Every PR must include:

1. **Finding**: what was observed, where, and how it was discovered.
2. **Root cause**: why it happened, not just what happened.
3. **Why this fix**: why this approach, and which alternatives were rejected.
4. **Severity** of the problem being fixed (or `n/a` for pure features).
5. **Before / After evidence** (required, see section 8).
6. **How to test**: steps written as "do X, see Y" so a judge or an AI screener can repeat them.
7. **Risk and rollback**: what could break and how to revert.
8. **On-chain impact**: network, contracts touched, transaction links, storage or gas changes.

## 8. Before / After evidence (mandatory)

| Change type | Required evidence |
| --- | --- |
| UI | Screenshot before and after at the same viewport. Video or GIF when the change is an interaction |
| Smart contract | Test output before (failing or missing) and after (passing). Gas or storage diff when it changes |
| On-chain behaviour | Transaction links: NearBlocks for NEAR, Basescan / the Robinhood Chain explorer / Solana Explorer for the treasury chains, Intents explorer when relevant |
| Economics (mNAV, fees, issuance) | Simulation output or chart before and after |
| Docs or config only | Rendered diff or a short note why no visual evidence applies |

Evidence goes directly in the PR description (drag and drop into GitHub). Files that must stay in the repo go to `docs/evidence/<pr-number>-before.png` and `docs/evidence/<pr-number>-after.png`.

## 9. Labels

| Group | Labels |
| --- | --- |
| Type | `type:bug`, `type:feature`, `type:finding`, `type:chore`, `type:docs` |
| Severity | `severity:critical`, `severity:high`, `severity:medium`, `severity:low` |
| Area | `area:factory`, `area:meme`, `area:pool`, `area:mnav`, `area:chainsig`, `area:intents`, `area:oracle`, `area:relayer`, `area:keeper`, `area:web`, `area:sim`, `area:docs` |
| Status | `status:blocked`, `status:needs-evidence`, `status:ready-to-merge` |
| Track | `track:defi`, `track:memecoins` |

## 10. Definition of done

- [ ] Linked issue closed by the PR (`Closes #<n>`).
- [ ] Tests pass locally and in CI.
- [ ] Before / After evidence attached.
- [ ] No secrets, private keys, or `.env` content in the diff.
- [ ] Docs updated (`README.md`, `docs/SPEC.md`) when behaviour or parameters change.
- [ ] Author, assignee, and reviewer are `@yeheskieltame`.

## 11. Safety rules for keys and mainnet

- Keys live in environment variables only. `.env` is git-ignored. Never commit a seed phrase or private key.
- Mainnet transactions use a dedicated dev account and tiny amounts (rule Q-007).
- Agents never sign mainnet transactions, push, make the repo public, or post on X without explicit confirmation from `@yeheskieltame`.
- Contract addresses (swap routers, stock tokens, oracle feed IDs) are copied from official sources listed in `docs/REFERENCES.md` and linked in the PR.
