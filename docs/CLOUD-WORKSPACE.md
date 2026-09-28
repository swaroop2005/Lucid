# Cloud workspace checkpoints and recovery

This prototype can archive its operational workspace as immutable Hindsight documents and recover a local cache from freshly read originals. Approved knowledge retrieval and operational recovery use separate scopes. A recovered archive alone does not establish that its articles or official documents are eligible investigation evidence.

The workspace supports one cooperating editor. Owner IDs record an explicit handoff; they are not authentication, a lease, a server-side lock, or compare-and-swap. Someone with the same bank credentials can still write competing documents. The recovery service detects competing observed descendant heads and refuses to choose a winner. A successful read cannot prevent a later concurrent write.

## What enters a checkpoint

The canonical projection includes workspace identity, companies, cases, articles, official documents, historical article associations, incidents, events, the local outbox, and durable learning-closeout journals. Learning journals preserve frozen source packets, operation identities, original connection identity and uncertainty status; they do not grant paid authority or restore article eligibility proofs. Article bodies and canonical revision history remain intact. Case attempts, timelines, tasks, resolution details, and authored drafts remain intact.

The projection excludes credentials, budget authority, provider request/response journals, derived-generation journals, recomputable case analysis/reflection, article Cloud retention proofs, scope proofs, Cloud history, and ephemeral synchronization flags. It rejects recognized credential and raw-evaluation fields inside the allowed data. This field check is not a general detector for secrets embedded in ordinary prose; review workspace content before publishing a private archive.

Canonical JSON is compressed losslessly with gzip and encoded as base64 fragments. Compression is not encryption. Each chunk is content-addressed; a manifest names all chunk hashes, the complete state hash, its parent manifest, current owner, next owner, and creation time. Documents use the isolated `lucid-operational:<workspaceId>` scope, not the approved-knowledge scope. Original text, document identity, bank, tags, and metadata must all match on readback. Extracted memory facts may be zero for an opaque archive; knowledge source reverification separately requires nonzero facts.

## Automatic checkpoints after committed saves

A successful operational save queues a checkpoint after a short debounce. Rapid committed changes coalesce into the newest canonical state; merely rendering a page, polling status, constructing the checkpoint queue, or restarting the server does not initiate an operational checkpoint. Editing an unsaved text field does not publish it. Changes to recomputable proof/status journals do not count as operational saves.

Before a new paid policy read or retention write, the queue discovers the current scoped Cloud head, checks the active editor, computes the complete snapshot and checks allowance for the entire batch. Individual operations still reserve durably before dispatch; the preflight is not a distributed atomic reservation. Its estimate includes all missing content-addressed documents and one bounded policy verification. Only exact previously verified document identities on the same bank and connection qualify for reuse. Small edits can change whole compressed chunks, so a small textual change can require several new documents.

The complete estimate must fit both the remaining overall authorization and the ingestion category allowance. More than 32 missing documents requires explicit review. Missing configuration, insufficient authority, ownership changes, competing history, local drift, or multiple unreconciled checkpoints leave the cache pending. Denial occurs before new paid policy/read-write work; bounded Cloud discovery reads may already have occurred. This does not purchase credits, recharge the account or reset prior reservations.

One queue worker publishes at a time. If a new committed edit arrives during a successful publication, there can be one bounded follow-up for the newer state; continuous changes do not create an unlimited paid background loop. An uncertain write gets read-only checks, never an automatic resend. Incomplete verification stops the worker, leaving the local cache pending. Restart alone does not retry the checkpoint. A later explicit save or manual reconciliation is required to make progress, and the same no-resend and authorization rules still apply.

The Connections panel displays recorded reservations, remaining authorized credit, remaining ingestion allowance, and any whole-save estimate recorded by preflight. These numbers are local dispatch safeguards, not billed provider charges or the actual account balance. An absent authorization status is shown as unavailable, not invented as zero. While a configured checkpoint is pending/processing/unverified, the panel polls only `GET /api/cloud-workspace` every three seconds. That endpoint reads local cached status and the local allowance; it does not invoke the provider, reverify sources or start writes. Polling stops on a verified status or status error. Recovery/source verification remains an explicit action.

This startup guarantee concerns operational checkpoints. Approved-knowledge learning is separate: startup or a settings change can resume a previously approved queued closeout, with matching existing authorization. Do not infer that the entire application makes no provider calls on boot.

## Manual checkpoint and handoff workflow

1. Review the current local cache and Cloud head. Stage a checkpoint against the exact expected parent, or `null` for the first checkpoint. Staging freezes content and its forecast and makes no retention write.
2. Publish that staged hash with a bounded write allowance. The HTTP default is five writes; the UI requests up to 32 and the full-batch authorization check still applies. Zero writes permits read-only reconciliation. Publishing is disabled in the UI and rejected by the service when another editor holds the active handoff.
3. The service reads a bounded, complete model-policy inventory before its first retention write in that invocation. Unknown or automatic-refresh policies prevent publication. It durably records each write attempt before dispatch.
4. Existing exact documents are reused. An uncertain dispatched write is never resent automatically. Bounded readback passes can recognize its later completion; otherwise the checkpoint stays pending.
5. Only after every chunk verifies does the service publish the manifest. Fresh discovery must establish that manifest as the unique complete head. New local edits made during publication keep the cache pending even if the older checkpoint verified.

At most three post-write document checks are made within an invocation, with an injectable wait between later passes. No indefinite provider polling, automatic pagination, or unbounded paid background archive loop runs. The committed-save queue adds at most three zero-write reconciliation passes, two seconds apart, after its bounded publication attempt. A later explicit publish can check an earlier uncertain write without resending it. The local write journal is essential for this behavior and must not be discarded casually.

The current conservative authorization policy reserves $0.15 per archive document, each at most 12,000 bytes, and $0.05 per bounded model-policy read. These are application reservations, not provider invoices or provider-enforced spending limits. The planner reports actual canonical, compressed, encoded, and document byte counts; token estimates are illustrative. Separate authorization is required before a paid write.

## Recovery workflow

The owner supplies the intended workspace ID and owner ID. Preview reads the complete bounded manifest inventory and every required chunk from Cloud, validates the full parent chain and content hashes, decompresses within its limit, and checks the head again. Preview returns counts and identity fields without replacing the local cache.

Applying a preview requires explicit replacement confirmation and the exact preview/local-cache hashes. Apply repeats the Cloud recovery reads; a changed head, connection, local cache, or expired preview rejects replacement. It saves the previous local state to a private backup first, then checks for changes again before replacing the cache. The default backup directory is `.data/recovery-backups`, with restrictive directory/file permissions. Backups can contain private operational data and must not be committed.

Recovery removes old Cloud eligibility proofs. A separate bounded source-verification action freshly reads each deterministic knowledge document, compares full original text, exact tags and metadata, and verifies nonzero facts before recording a new connection-bound proof. It sends no retention write. Failed verification leaves that source ineligible. Proof updates and ephemeral synchronization changes do not change the canonical archived content hash.

A different owner may recover a read-only cache. Editing requires the currently recorded owner or an explicit checkpoint handoff. This is cooperative coordination, not protection against an untrusted credential holder. The application must invoke the edit guard before operational mutations.

## HTTP interface

All endpoints use the configured server-side Hindsight connection. No endpoint accepts credentials in its request body.

| Endpoint | Input and result |
| --- | --- |
| `GET /api/cloud-workspace` | Local owner, workspace, configured flag, cached checkpoint status, optional automatic-save estimate, pending forecasts, local content hash and budget status (`authorized`, `reservedUSD`, `remainingUSD`, `ingestionRemainingUSD`, `note`). This endpoint does not call the provider or freshly verify Cloud. |
| `POST /api/cloud-workspace/stage` | `{expectedParentHash, nextOwnerId?}`. Reads current Cloud ancestry and freezes a matching checkpoint; returns hash, status, and forecast. |
| `POST /api/cloud-workspace/publish` | `{snapshotHash, maxWrites?}`. Explicit bounded publication; `maxWrites` is 0–32, default 5. Zero permits read-only checking. |
| `POST /api/cloud-workspace/recovery-preview` | `{workspaceId, ownerId}`. Returns preview ID, expected local hash, snapshot hash, owner, editability, and entity counts. |
| `POST /api/cloud-workspace/recovery-apply` | `{previewId, expectedLocalHash, snapshotHash, confirmReplace:true}`. Fresh recovery, private backup, guarded replacement; source reverification still required. |
| `POST /api/cloud-workspace/verify-sources` | `{sourceIds:[...]}`. One to 32 distinct canonical article/document IDs; fresh source reads and per-source verification results. |

Three recovery previews are retained in memory, each valid for ten minutes. Restart requires a new preview. Archive history discovery is capped at 128 manifests, a snapshot at 128 chunks and 8,000,000 uncompressed bytes. Partial inventories, missing ancestors, unknown identities, and conflicting branches reject recovery rather than silently selecting or truncating data.

## Implementation and verification

- `server/cloud-checkpoint-budget.js`: complete-save allowance checks against an existing workspace/connection-bound authorization.
- `server/cloud-checkpoint-queue.js`: committed-save debounce, whole-save preflight, bounded follow-up and no automatic resend.
- `server/cloud-workspace.js`: canonical projection, compressed immutable plans, cost forecast, complete ancestry inspection, bounded publication journal, exact recovery.
- `server/cloud-source-reverification.js`: fresh article/document original-text verification and new eligibility proofs on the configured connection.
- `server/cloud-workspace-routes.js`: SDK adapter, local owner, staged routes, preview/application guards, private backup, and explicit source verification.
- `server/cloud-read-budget.js`: bounded recovery reads without granting paid credit authority on a new cache.
- `tests/cloud-checkpoint-queue.test.js`, `tests/cloud-workspace.test.js`, `tests/cloud-source-reverification.test.js`, and `tests/cloud-workspace-routes.test.js`: isolated fake-provider coverage for exact recovery, owner handoff, forks, drift, lost responses, no duplicate writes, delayed readback, bounded requests, guarded replacement, and proof refresh.

The browser fixtures cover manual staging/publication, recovery confirmation, handoff, source verification, whole-save allowance display, pending-only local polling and wrong-owner publication guards. They do not exercise real paid Cloud operations.

The module tests do not establish that a particular live bank has completed migration, or that investigations are accurate. Consult the separately recorded live migration/readback proof and quality results. A complete operational snapshot is recoverable data, not a transactional distributed database.
