# Architecture and source boundaries

## Runtime

A React/TypeScript interface uses React Query for local API state. Express serves the API and either Vite development assets or the production build. SQLite stores the local workspace and a separate evidence index. The server binds to loopback and has no user-login or tenant boundary.

`server/index.js` wires settings, store, Hindsight, budget authorizers, learning and the Cloud checkpoint queue. Normal runtime requires Cloud for preparation; only the isolated test server opts into offline rehearsal. `server/app.js` guards API mutations and calls the committed-save callback after durable operational changes. It hashes canonical operational state so proof/status-only changes do not generate another archive.

`src/App.tsx` owns navigation, case selection and request transitions. The case editors, knowledge tools, source browser and Connections panels keep loading/error/empty states distinct. Unsaved drafts are guarded across navigation, and old asynchronous callbacks cannot navigate the user away from a newer selection.

## Investigation boundary

`server/hindsight-investigation.js` implements bounded candidate generation and an evidence audit. The default normal protocol is `audit-v1`; `server/investigation-plan.js` contains developmental plan validation and source-authority logic used by a separate experiment. Its existence does not promote it into the active runtime.

`server/source-investigation.js` opens source-linked cases. `server/openai.js` contains shared investigation helpers and legacy integration code; these are distinct modules, not alternate names for one file. Hindsight remains the active AI path.

Historical outcomes, official versioned documents and current-case observations have different authority. Eligibility requires canonical local records plus exact Cloud identity, tags, revision, connection binding and verified original content. Derived aids and operational archive documents are excluded from approved-knowledge retrieval. A failed audit preserves existing user drafts.

## Knowledge closeout

An explicit human review decision approves an outcome. `server/learning-closeout.js` derives a deterministic revision-bound closeout, records dispatch durably, retains only approved content and verifies its original text. `server/learning-authorization.js` binds the paid operation to that approved revision. `server/learning-routes.js` schedules bounded processing and read-only status checks. Its startup and settings-change resume path can continue previously approved queued work.

Pending, processing, unverified and succeeded are distinct. Lost responses do not authorize blind resend. Generated drafts, failed suggestions and unapproved candidates do not enter this learning path. Durable closeout changes can notify the operational checkpoint callback; changes excluded from the canonical projection do not trigger another archive.

## Operational Cloud archive

`server/cloud-workspace.js` projects canonical operational data, compresses it losslessly and creates content-addressed chunks plus a parent-linked manifest. It preserves cases, authored drafts, tasks, articles and revisions while excluding credentials, credit authority, raw provider journals and recomputable verification state.

`server/cloud-checkpoint-queue.js` debounces successful committed saves, discovers the Cloud head, checks the owner and preflights the complete missing-document estimate. It performs one bounded publication and at most one bounded follow-up for newer committed state. Uncertain writes get bounded read-only reconciliation, not automatic resend. Constructing this queue, restarting the app or polling local status does not initiate an operational checkpoint.

`server/cloud-workspace-routes.js` provides manual stage/publish, recovery preview/apply and source reverification. Recovery checks fresh complete ancestry and originals, saves a private local backup, and rejects changed Cloud heads or local state. `server/cloud-source-reverification.js` freshly verifies knowledge originals and nonzero facts for the destination connection; recovery alone strips old eligibility proofs.

Owner handoff coordinates one cooperating editor. It is not authentication, a distributed lock, lease or atomic compare-and-swap. Competing observed descendants reject recovery. Someone sharing the credentials can still create conflicting history after a successful read.

See [the Cloud protocol](CLOUD-WORKSPACE.md) for endpoint shapes and explicit bounds.

## Allowance and read budgets

`server/hindsight-budget.js` and the serialized ledger reserve before dispatch, bind paid calls to workspace/connection, and preserve uncertain reservations. `server/cloud-checkpoint-budget.js` reads existing authority to check that the whole save fits remaining total and ingestion allowance. The public setup accepts an explicitly chosen $1–$50 cap; the initializer alone is unbound and cannot authorize runtime dispatch.

`server/cloud-read-budget.js` bounds metadata/recovery reads without granting paid ingestion authority to a recovered cache. A read allowance is not permission to retain documents. Local reservations and displayed remaining allowance are application controls, not measured provider charges or a verified account balance.

## Public package and private state

The repository contains source, isolated tests and small authored/synthetic fixtures. It excludes operational databases, credentials, ledgers, private articles, downloaded report discussions, versioned source caches, evaluation gold, raw traces and screenshots. Fresh setup does not recreate those files.

`server/demo-evidence.js` tolerates an absent private snapshot. Public tests inject synthetic versioned documents instead of requiring excluded caches. The private-library utility can transfer canonical library metadata into a new database; full operational continuity uses a verified Cloud archive and the explicit recovery workflow. Neither route transfers spending authority or proves answer quality.
