# Setup

## Local installation

Use Node.js **22.13 or newer**, npm and a supported browser. The server uses built-in `node:sqlite`. Run from the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. First startup creates nine reconstructed public-source fixture cases. You can inspect and edit local records; normal investigation preparation requires a configured Hindsight connection and explicit matching allowance. Only the isolated test server enables offline rehearsal. Source-dependent panels can be empty until their excluded private material is supplied.

For a built local run:

```sh
npm run build
npm start
```

The application binds to loopback and has no user authentication. Do not expose it publicly. Stop the server before replacing or restoring its database outside the guarded recovery workflow.

## Development checks

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests create an isolated server and fixture databases, use bundled Chromium and fake provider responses, and must not reuse private settings. Some Linux systems need browser system libraries; `npx playwright install --with-deps chromium` may require administrator privileges. These downloads are separate from paid AI use.

Do not run archival, ingestion or evaluation utilities merely to populate an empty panel. The full report corpus, previous 247-article library, downloaded discussions, official-source proofs and versioned-document cache are excluded. Small authored/synthetic research fixtures are included; they are not the downloaded corpus.

## Private local state

| Variable | Purpose |
| --- | --- |
| `PORT` | Loopback HTTP port, default `4317` |
| `DATA_FILE` | Workspace SQLite file, default `.data/lucid.sqlite` |
| `EVIDENCE_FILE` | Separate evidence-index SQLite file |
| `SETTINGS_FILE` | Private server-side Hindsight settings |
| `HINDSIGHT_CREDIT_LEDGER` | Private spending-authorization/reservation ledger |
| `CLOUD_READ_LEDGER` | Bounded metadata/recovery-read ledger, no paid-write authority |

Copy `.env.example` to a private `.env` if overrides are needed. Runtime/configuration/authorization commands load it; the private-library command takes explicit paths. The legacy numeric label in the default spending-ledger filename grants no allowance.

Keep databases, credentials, ledgers, raw traces, archives and `.data/recovery-backups/` out of version control. Do not put real API keys in checked-in files or shell arguments retained in history. Cloud archives contain operational content; gzip compression is not encryption.

## Configure Hindsight

Save the intended endpoint, bank and key through **Connections**. The current endpoint is fixed to `https://api.hindsight.vectorize.io`. Settings are stored server-side with restrictive local file permissions; the browser receives status, not the key. A settings save grants no spending authority and does not itself perform a paid connection test.

For initial command-line configuration, put `HINDSIGHT_BASE_URL`, `HINDSIGHT_BANK` and `HINDSIGHT_API_KEY` into a private `.env`, then run:

```sh
npm run cloud:configure
```

This writes local settings with **zero provider calls**, rejects placeholders and refuses to overwrite an existing connection. Those environment variables alone do not configure the application workflow. Review later changes in Connections.

Choose a bank-restricted key and appropriate expiration where your provider permissions allow. A bank restriction does not make a key read-only. This application can perform paid reasoning and retention writes after explicit local authorization. It does not restrict a copied key used elsewhere.

## Deliberately authorize an allowance

Initialize the workspace by starting the app once. For recovery, recover the intended workspace identity before creating a new paid allowance. Save the intended connection, choose a cap deliberately, and run for example:

```sh
npm run cloud:authorize -- --cap-usd 10 --acknowledge-paid-usage
```

This example creates a **new $10 local dispatch allowance**. It makes zero provider calls, buys no credits and does not verify account balance. Caps from $1 to $50 are supported. The ledger binds to the current workspace and exact saved connection and refuses to overwrite an existing ledger. Different workspace identity or key invalidates that authority.

The fixed allocation is deliberate: **40% ingestion, 40% investigation/evaluation, 10% derived aids, 10% protected buffer**. With the $10 example, ingestion has $4, investigation $4, derived work $1 and the buffer $1. Operational checkpoint documents and approved-outcome learning share the ingestion category. A whole checkpoint must fit both remaining overall and ingestion allowance before paid work begins; available allowance in another category is not silently borrowed. Choose a cap suitable for the displayed estimate and planned learning, rather than assuming the full cap can all be used for storage. The public runtime accepts these portable explicit caps.

Reservations are conservative application estimates, not provider invoices, a verified balance or a provider-enforced spending limit. Uncertain dispatched operations keep their reservations. Do not delete, reset or copy a ledger to erase uncertainty or imply renewed authority. Setup does not recharge or purchase credit.

## What can run automatically

Once authority and configuration match, a **successful committed operational save** can queue a Cloud checkpoint. The queue debounces/coalesces edits, checks the whole-save estimate and owner, publishes a bounded batch and allows at most one bounded follow-up. More than 32 missing documents, insufficient allowance, changed ownership or unresolved history leave the local cache pending. An uncertain write is checked read-only and never automatically resent. A subsequent explicit save or manual reconciliation may be needed.

Starting the app, constructing the checkpoint queue or polling Connections does **not** start an operational checkpoint. The Connections poll reads local status/allowance only; it does not call the provider.

Approved-knowledge learning is different: explicit review approval queues a closeout. A previously approved closeout may resume at startup or after a settings change when existing authority matches. Generated drafts and failed suggestions are excluded. Consequently, an existing authorized workspace can make provider calls on boot for previously approved learning. “No checkpoint on boot” is not a global no-provider-call guarantee.

## Continue an existing workspace

Connecting a bank does not automatically reconstruct the local collection. Extracted facts alone cannot recover canonical articles, drafts, cases or revision identity. If the bank contains a complete verified operational archive, use **Connections → Cloud workspace**:

1. Enter the intended workspace and owner identities and request a recovery preview. This reads and validates the complete bounded parent chain and original chunks; it does not replace local state.
2. Review counts and identities. Explicitly confirm replacement to apply the exact preview. Apply repeats reads, rejects drift and saves a private backup before replacement.
3. Request source reverification for recovered articles/documents. Old eligibility proofs are removed. Exact original text, scope metadata and nonzero facts must match before a source becomes eligible on the destination connection.
4. Create new paid authority for that recovered workspace only if paid use is intended. Read-only recovery does not grant retention or investigation allowance.

The current connection identity includes a hash of URL, bank and exact key. A new key requires fresh source verification and matching new authorization, even for the same bank. Do not invent proof fields or share credentials to avoid this boundary.

One cooperating editor is supported. A different owner may recover a read-only cache; operational editing/publication requires the active owner or explicit checkpoint handoff. This is not an authenticated lease or distributed lock. See [Cloud checkpoints](CLOUD-WORKSPACE.md) for limits and conflict behavior. This repository does not claim that any particular live bank has completed migration.

## Optional private library handoff

If no operational archive exists, the separate library utility can move canonical library metadata privately. Stop the destination app before import. On the source installation:

```sh
npm run library -- export --workspace .data/lucid.sqlite --file .data/private-handoff/library.json --acknowledge-private-data
```

The source database is read-only. The new private bundle contains only `workspaceId`, `articles`, `officialDocuments` and `historicalKnowledgeAssociations`. Top-level cases, companies, credentials, budgets and traces are excluded. Nested article provenance remains intact and may be private: review before transfer. The checksum detects accidental changes; it does not authenticate the sender or prove semantic safety.

Import into a nonexistent database path:

```sh
npm run library -- import --workspace .data/library-workspace.sqlite --file .data/private-handoff/library.json --acknowledge-private-data
```

Import refuses an existing destination, checks identities/checksum, preserves the canonical library/workspace identity and creates the nine normal fixture cases. It makes no provider calls and performs no fresh Cloud verification. Set private `DATA_FILE=.data/library-workspace.sqlite` before starting it. Save credentials separately and deliberately create matching paid authority if needed. The evidence index and full discussions are not transferred. This library-only path does not preserve operational cases or substitute for complete Cloud recovery.

## Troubleshooting

- **SQLite errors:** verify the Node version and reinstall dependencies after changing runtime.
- **Empty historical/source panels:** excluded corpora/caches are not downloaded during setup.
- **Configured but preparation unavailable:** check matching workspace/connection allowance; settings alone grant none.
- **Pending Cloud save:** inspect whole-save estimate, ingestion allowance, recorded owner and exact status. Pending is local success without verified Cloud completion.
- **Uncertain write or identity mismatch:** preserve the journal and reconcile read-only; do not blindly resend or alter proof fields.
- **AI verification failure:** earlier drafts stay intact. Repeated retries are not a setup fix; see [quality](QUALITY.md).
