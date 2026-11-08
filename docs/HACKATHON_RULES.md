# NEAR HACKATHON Rules Summary

Summary of [HACKATHON.md](https://nearhackathon.com/HACKATHON.md) as of 8 Nov 2026. The official file can change: **re-read the live version before submitting**.

## Facts

| Item | Value |
| --- | --- |
| Code counts from | 19 Oct 2026 (announcement) to 14 Nov 2026 |
| Submissions open | 1 Nov 2026 00:00 UTC |
| Deadline | **14 Nov 2026 23:59 UTC = 15 Nov 2026 06:59 WIB** |
| Judging | 16 Nov 2026 |
| Results announced | by 18 Nov 2026 23:59 UTC |
| Prizes | $10K / $3K / $2K per track, $55K grand prize, paid in NEAR |
| Solidon tracks | `defi`, `memecoins` |

## Rules that matter most for Solidon

| Code | Rule | What it means for Solidon |
| --- | --- | --- |
| Q-001 | Code from 19 Oct counts; earlier commits are baseline | Keep old code separate from new code |
| Q-002 | A product on another chain is allowed; only the NEAR integration is judged | Old bStocks/PancakeSwap code = baseline, stated in the README |
| Q-003 | A new repo is not required: a dedicated branch or tags `pre-hackathon` and `hackathon-submission` + a diff link in the README | Both tags are mandatory |
| Q-004 | An old project as-is is not allowed; new features built in the window are | Every NEAR part is built inside the window |
| Q-005 | Libraries, templates, and AI code are allowed but must be listed | README has a "Baseline & tools" section |
| Q-006 | 1Click JWT is optional; without it the fee is 0.2% | Optional |
| Q-007 | Intents has no testnet | Mainnet, separate dev account, small amounts, `dry: true` |
| Q-010 | Testnet-only projects are eligible | Non-Intents parts may stay on testnet |
| Q-011 | No mandatory integrations | Hints are suggestions only |
| Q-012 | A local demo is fine but needs a public repo, a reproducible README, and a video on X | A hosted demo is a plus; keep it live until 18 Nov (ideally 25 Nov) |
| Q-014 | Any license; add a LICENSE file | MIT |
| Q-015 | At most 2 projects per person; they must be independent and name each other in the README | Solidon's README names NYXERON |
| Q-017 | Claude Code and Codex screen projects (reproducibility, feature checks, preliminary score); human judges decide | README is written for machines too: "do X, see Y" steps |

## Demo post on X

- First sentence = the user's problem, understandable to someone who has never heard of Solidon.
- Show one complete moment: from a user action to a visible result.
- Explain NEAR's role concretely (Chain Signatures, Intents), not "powered by NEAR".
- Must tag `@NEARProtocol` and `#NEARHackathon`. Optional: `@NearLegion`, `@NearBuilders`.
- Close with links to the demo and repo, and invite feedback.

## Submission fields

`projectName`, `leadName`, `email`, `size` (`1`), `tracks` (`["defi","memecoins"]`), `nearAddress` (mainnet account for the prize), `projectUrl` (public repo, unique), `demoUrl` (X post), `idea` (20–2000 characters), `consent`.

Submit **once**. Mistakes are fixed through https://nearhackathon.com/request-changes, not by submitting again.
