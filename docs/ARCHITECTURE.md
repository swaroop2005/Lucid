# Architecture

Lucid is a loopback-only React/Vite interface with an Express server and local SQLite state. Hindsight is the only active AI integration. Local preparation remains available without a provider key.

## State and evidence

| Kind | Stored locally | Meaning |
|---|---|---|
| Operational case | Report, environment, attempts, planned checks, editable drafts and outcomes | Current reported facts and explicitly recorded actions |
| Historical source report | Separate evidence index and optional full discussion | Research material; closure does not prove a fix worked |
| Experiential article (`KA-…`) | Immutable reviewed payload, revision, hash and provenance | A qualified source-reported lesson, not confirmation of a current cause |
| Official document (`DOC-…`) | Exact release, source URL/hash and whole bounded section | Normative guidance requiring exact-version and environment applicability |
| Derived aid | Separate frozen plan and generated snapshots | Unreviewed synthesis of two or three source articles |
| Provider/authorization records | Private settings, ledger and operation audits | Connection identity, bounded dispatch and traceability |

The public package supplies nine reconstructed fixture cases and small authored research fixtures. It does not bundle a private operational workspace, downloaded corpus, prepared knowledge library, retained-source proofs or provider credentials. An existing bank is not a replacement for the local state table above.

## Investigation flow

1. The API validates an explicit preparation request and preserves current case identity.
2. Local mode uses templates and keyword retrieval without AI.
3. Hindsight mode selects only locally known, verified, applicable source revisions and reserves an authorized operation before dispatch.
4. Recall searches exact source scopes. Canonical whole local evidence, full attempts and planned history become the candidate context.
5. Candidate Reflect returns structured text, citations, facts and trace. The server verifies IDs and complete fact ancestry. The candidate remains private.
6. One mandatory audit Reflect receives the frozen whole case, evidence and original candidate using the same source scopes. It must return exact quote/path anchors and diagnostic questions.
7. Only a valid diagnostic result can be applied. Candidate prescriptions remain withheld even when the audit calls them supported. Any failure preserves previous drafts; there is no hidden fallback or retry.

The output is an interim question-only safeguard. It does not establish reliable full investigation, semantic correctness or resolution.

## Important modules

| Module | Responsibility |
|---|---|
| `server/index.js` | Local server startup, stores, private settings and injected authorizer |
| `server/app.js` | Local HTTP boundary, case orchestration and safe public projections |
| `server/db.js` | Transactional workspace SQLite storage |
| `server/evidence-store.js` | Local historical source search, discussions and reserved-source selection rules |
| `server/historical-knowledge.js` | Exact source-hash/quotation imports, immutable articles and separate report associations |
| `server/memory-evidence.js` | Canonical bounded retention packets with actual review basis |
| `server/curated-retention.js` | Frozen batch manifests, durable dispatch identity and status/content verification |
| `server/hindsight-scope.js` | Exact article revision/fingerprint scopes and impossible empty-memory filter |
| `server/hindsight-documents.js` | Separate exact-release official sources and immutable whole-section packets |
| `server/hindsight-investigation.js` | Candidate and audit orchestration, strict source ancestry and drift checks |
| `server/hindsight-audit.js` | Typed audit, exact anchor membership, narrow language guard and diagnostic renderer |
| `server/hindsight-derived.js` | Manual source-scoped synthesis with preserved snapshots and stale-state checks |
| `server/hindsight-budget.js` | Existing local authorization, bounded operation kinds and durable reservation hooks |
| `server/providers.js` | Local memory implementation and Hindsight SDK boundary |
| `scripts/configure-cloud.js` | Explicit initial server-side credential save, with no provider call |
| `scripts/authorize-cloud.js` | New exclusive local allowance tied to workspace and exact connection |
| `scripts/private-library.js` | Private allowlisted library export/import; no operational cases, credentials or authority |
| `src/App.tsx` | Case, Knowledge and Connections workflows |
| `src/MemoryTools.tsx` | Source contribution, audit limitation and retention status display |
| `src/HindsightDocuments.tsx` | Inert whole-source text and exact-version provenance |
| `src/HindsightDerived.tsx` | Local plan review and explicit credit-using derived actions |

Some preserved modules contain earlier provider implementations. They are not mounted as active investigation routes. Their existence is not a fallback or an instruction to provide another provider key.

## Source and budget boundaries

Source filters are an OR of exact complete article/document tag sets, not a broad workspace filter. Retention proof requires matching original content, revision/hash, tags and nonzero extracted facts. Returned observations require complete ancestry within the selected source. Empty-memory mode uses an impossible filter.

Unknown historical applicability permits only uncertain hypotheses/questions. Known incompatible environments are excluded. Official documents require a known exact matching component release. A source hash proves identity, not truth; retrieval does not create independent corroboration.

Whole evidence selection is bounded. The initial context has a 16KB preparation allowance and a 19KB final candidate-query guard; the audit query allows 48KB and the structured audit 24KB. Oversized complete content is rejected rather than silently truncated. Provenance reads are capped at 32 per reasoning stage. The SDK does not automatically retry requests, although the hosted service can have its own internal behavior.

Public APIs exclude raw candidate drafts, private claim spans, retained packets and detailed internal audits. Visible audit metadata contains counts, status and limitations. Exact quoted historical facts remain labeled source material.

A local credit ledger reserves before dispatch, records uncertainty and stops on insufficient credit. It is not a Cloud invoice or hard provider limit. Starting the app or saving settings creates no spending permission. The private handoff omits the previous operator's authority. Its connection proofs still bind the exact key hash, bank and URL; a different key requires a separate re-verification workflow that is not currently implemented. Import validates the private bundle locally and makes no fresh Cloud verification call.

## Derived aids and security limits

Derived aids use two or three verified source revisions, isolated model tags, manual refresh and no nested mental models. Their snapshots do not mutate published articles. Successful provenance checks make a snapshot reviewable, not human-approved. Investigations continue to exclude mental models.

The server has no authentication or public deployment boundary. Keep it on loopback. Its Cloud key is not technically restricted to read-only access by the app, and explicit retain/derived workflows can write or spend. See [setup](SETUP.md) before configuring a provider.
