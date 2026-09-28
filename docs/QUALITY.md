# Quality and limitations

## Current conclusion

**Reliable full AI investigation and resolution remain unresolved.** Source identity, bounded dispatch, exact readback and structured validation are useful controls; they do not establish semantic accuracy. The normal runtime still uses `audit-v1`. The new semantic-plan experiment has not been promoted.

## Measured live results

| Run | Design | Result |
| --- | --- | --- |
| Earlier audit-only pilot | Twelve immutable candidates: ten known material-error outputs and two high-scoring controls; one audit each | **0/12 delivered**; all failed structured-audit validation. |
| Earlier fresh paired check | Two locally new real reports, memory and empty-memory arms | **0/4 delivered**; audit or candidate verification rejected every attempt. |
| Latest developmental semantic-plan replay | Four previously used inputs, two arms each | **5/8 delivered**, three rejected. All five delivered outputs contained material errors. Delivered-output mean **3.4/10**. |
| Prepared fresh cohort | Fifty newly prepared cases, intended 100 paired arms | **Not executed.** No success rate or quality improvement can be inferred. |

The newest review was source-aware AI grading, with arm labels visible; it was not blind human verification. Previously used replay inputs make it a developmental comparison, not an independent benchmark. Only two input pairs delivered both arms: their memory-minus-empty score differences were +1 and −2. The partial paired results do not establish a memory benefit. The 3.4/10 average describes delivered outputs only; rejected attempts are not silently counted as successful answers.

The older saved-candidate pilot deliberately included known failures and was not an unbiased benchmark. “Locally new” means newly introduced to that run, not proven absent from model training. Delivery counts measure whether the application accepted output; they are not semantic correctness rates.

Observed failure classes include historical workarounds becoming current prescriptions, unsupported causal or configuration inferences, and invented command syntax. Correct citations and exact source ancestry did not prevent these errors. Private gold labels, raw provider responses and operational run archives are excluded from this repository; this document reports aggregate findings only.

## What the implementation checks

- Exact workspace/connection identity, canonical source revision, retained-document identity, original content and scope tags.
- Bounded case/evidence context and citation/fact ancestry.
- Case, source and candidate quotation/path membership in the audit.
- Private candidate withholding and narrow guards on generated executable or prescriptive prose.
- Durable local reservations, bounded operations, uncertain-write journals and preservation of previous drafts on failure.
- Operational archive chunk/manifest hashes, complete parent history, ownership conflicts, local drift and explicit replacement confirmation.
- Explicitly approved outcomes for learning; drafts, failed suggestions and operational archive chunks are excluded from approved-knowledge retrieval.

Quotation membership is not entailment. An auditor can share the candidate model's mistakes. A valid response is neither human approval nor a reproduced current cause. Archive integrity proves faithful storage of content, not that the content is accurate or suitable as advice.

## Software tests and migration evidence

Unit and browser fixtures exercise isolation, source scope, immutable identity, recovery, allowance checks, failure handling and interface state. They make no real paid provider calls. Run `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e` for the checked-out revision; test counts and outcomes belong to that exact run.

Responsive/browser smoke checks cover selected structural accessibility rules and viewport bounds. They are not a full accessibility certification or a screen-reader/contrast audit. A fake-provider recovery test does not prove a particular live bank was migrated. A real migration requires independently recorded original-text readback and recovery verification; no such success is claimed by this public package.

## Practical limits

- Local unauthenticated prototype, with one cooperating editor and no public tenant isolation.
- Hindsight is the active AI provider. Search depth changes retrieval effort, not a customer-selected hosted model.
- Normal preparation requires Cloud configuration and matching explicit allowance; local records can remain pending without them.
- Automatic checkpoints require the complete batch to fit total and ingestion allowances. They are bounded and can remain pending after uncertainty or limits.
- Approved learning can resume previously queued work at startup. Operational checkpoint construction/startup and local status polling do not initiate provider work.
- Connection identity includes the key. Recovered sources need fresh verification before becoming eligible under a different connection.
- Compression is not encryption. Operational archives and private recovery backups may contain sensitive case content.
- Local reservations are not billed charges, provider balances or hosted spending limits. Repository setup transfers no prior authority or credits.
- Owner IDs and fork detection are not authenticated leases or compare-and-swap; simultaneous uncoordinated writers are unsupported.
- Manual derived aids remain unreviewed and excluded from case investigation context.

Lucid is currently an evidence workspace and an investigation testbed. It is not a proven autonomous support resolver.
