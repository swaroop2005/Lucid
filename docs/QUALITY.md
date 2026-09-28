# Quality and limitations

## Current conclusion

**Reliable full AI investigation and resolution remain unresolved.** The code can enforce source identity, bounded dispatch and fail-closed validation, but those controls do not prove that generated advice is correct or useful.

The final measured safety workflow withholds original candidate recommendations and attempts to deliver only diagnostic questions and conditional observations. It is an interim guardrail, not a completed solution to the accuracy problem.

## Final live delivery results

| Run | Design | Delivered result |
|---|---|---|
| Audit-only pilot | Twelve immutable saved candidates: ten earlier material-error outputs and two high-scoring controls; one audit each, no candidate regeneration | **0/12**. All failed structured-audit validation. |
| Fresh paired check | Two separately frozen local-new real reports, each with memory and empty-memory arms; same local references/search depth per pair | **0/4**. One pair failed audit validation; the other failed candidate verification before an audit was dispatched. |

These are operational delivery outcomes, not semantic accuracy scores. Withholding invalid output avoids presenting it as advice, but withholding every attempt also means the system did not demonstrate useful accepted output. The saved-candidate pilot deliberately included known failures and is not an unbiased benchmark. “Local-new” means newly introduced to that evaluation, not proven absent from model training.

Earlier prompt-only source-authority changes also failed to establish reliable grounding. Known error classes included carrying a historical workaround into a current prescription, inferring configuration behavior from insufficient observations, and inventing command syntax. Correct citations and exact retained-source ancestry did not prevent those errors.

The public repository excludes private run archives and operational state. This summary does not suggest that the excluded artifacts or prepared source library will appear after installation.

## What the implementation checks

- Current workspace/connection identity and exact retained source revision, content hash and tags.
- Whole bounded case/evidence context, including failed attempts and planned history.
- Canonical citation identity and complete bounded fact/observation ancestry.
- Exact source, case and candidate quotation/path membership in the audit.
- A narrow generated-prose check for executable syntax, explicit configuration-change requests and overconfident exclusions.
- Private candidate withholding, even when the auditor labels a prescription supported.
- Durable local spending reservations, no hidden retry and preservation of previous drafts on failure.

Quotation membership is not entailment. A second AI assessment can share the first model's error, miss a risky sentence or misunderstand a prerequisite. The language guard can miss paraphrases and reject benign wording. It is not a semantic safety proof. A valid structured response is not human approval, reproduction or a confirmed current cause.

## Software tests versus answer quality

The preceding implementation checkpoint reported **245 unit tests**, **21 browser tests**, lint and build passing, plus a focused rerun of the audit-notice browser test. Those counts describe that checkpoint, not an automatically rerun guarantee for every fresh checkout. Public-export portability changes can alter test selection and counts; run the checked-in commands for the current revision.

Tests use isolated stores and fake SDK responses to exercise scope, privacy, immutability, failure handling and interface behavior. They do not demonstrate hosted-model obedience. The installed dependency lockfile, runtime version and actual run output determine reproducibility.

## Other limits

- Local, unauthenticated prototype; no public deployment or tenant isolation guarantee.
- Hindsight is the only active AI integration. The reviewed hosted configuration exposes no customer model selector; deep search does not mean a stronger model.
- A fresh clone has nine public reconstructed fixture cases, not the earlier private workspace or its 247-article library.
- Cloud facts alone cannot rebuild the required canonical local source metadata and exact scope identities.
- Unknown versions remain unknown; historical success is not a general affected-version range.
- The Cloud key is not constrained by this app to read-only or least-privilege use. Writes and paid calls are possible through explicitly authorized workflows.
- A local allowance is a conservative dispatch reservation, not a provider invoice or hard Cloud cap. No prior authority, credits or balances are transferred with the repository.
- Manual derived aids remain unreviewed even after source verification; they are excluded from case investigation context.

Do not describe this release as a proven autonomous support resolver. Its useful current role is a local evidence workspace and a transparent testbed for stricter retrieval and review boundaries.
