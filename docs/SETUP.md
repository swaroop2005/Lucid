# Setup

## Requirements and local installation

Use Node.js **22.13 or newer**. Release preparation was tested with **Node.js 22.22.1 and npm 9.2.0**. The server uses the built-in `node:sqlite` API; an older runtime is not sufficient. Install npm dependencies from the committed lockfile:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. The server binds to loopback. Default preparation uses local templates and keyword retrieval; it does not call an AI provider.

For a built local run:

```sh
npm run build
npm start
```

Run these commands from the repository root so relative data, static assets and configuration paths resolve correctly. Stop the server before replacing or restoring its local database.

First startup creates nine reconstructed public-source fixture cases and their anonymous demonstration records. They are not a transferred operational database. Downloaded historical reports, the full demo-evidence snapshot, full discussion downloads, the previously prepared knowledge library, official-source retention proofs and cached versioned documents are excluded from the public package. Small authored incident-study and corpus-expansion fixtures are included; they do not constitute the downloaded corpus. Source-dependent panels can be empty or show unavailable evidence until the required local material is supplied.

## Checks

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite starts an isolated local test server and separate fixture databases. It must not reuse a running production workspace or private credentials. The configuration uses the bundled Chromium browser. Some Linux systems also need its system libraries; `npx playwright install --with-deps chromium` installs them where supported and can require administrator privileges. Dependency and browser installation may download software; that is separate from paid AI-provider use.

Some archival/evaluation utilities rely on private or excluded source artifacts. They are not setup steps. Do not run historical live-evaluation, bulk-ingestion or provider scripts merely to make an empty panel look populated.

## Local state

The normal workspace and evidence files live under `.data/`. The workspace database contains cases, attempts, drafts, articles and private workflow records. The separate evidence database indexes collected source reports and notes. These files are local application state, not public repository assets.

Common server overrides are:

| Variable | Purpose |
|---|---|
| `PORT` | Local HTTP port; default `4317` |
| `DATA_FILE` | Workspace SQLite file |
| `EVIDENCE_FILE` | Local evidence-index SQLite file |
| `SETTINGS_FILE` | Private server-side Hindsight settings file |
| `HINDSIGHT_CREDIT_LEDGER` | Private local spending-authorization ledger |

The optional `.env.example` supplies local defaults. If needed, copy it to a private `.env`, then edit it locally; do not commit the result. The default ledger filename includes an older numeric label, but its name grants no allowance.

Keep private databases, settings, handoff packages, output traces and authorization ledgers outside version control. Do not place real API keys in a checked-in configuration file or paste them into a shell command that will be retained in history. Back up local state before intentionally replacing it.

## Optional Hindsight configuration

1. Obtain your own Hindsight Cloud access and bank identifier.
2. Open **Connections** and save your endpoint, bank identifier and API key.
3. Review the local budget policy and explicitly authorize a bounded allowance through the supplied authorization tool before requesting paid work.
4. In a case, select Hindsight, choose balanced or deep **search**, and explicitly request preparation.

The current endpoint is fixed to `https://api.hindsight.vectorize.io`; arbitrary or self-hosted endpoints are not supported by this settings form. Settings are stored in a server-side file with restrictive file permissions where the operating system supports them. The browser receives configuration status, not the API key. Saving settings does not perform a paid connection test, start retention or grant spending authority.

Each otherwise valid live investigation has a candidate-generation call and one mandatory audit call, plus optional Recall and bounded provenance reads. Both reasoning stages can incur charges. Search depth is retrieval effort; it does not select a stronger hosted model. The reviewed hosted configuration exposes no customer model selector.

### Optional local credential configuration command

The Connections screen is sufficient. For an initial command-line save, put the three values in a private `.env`: `HINDSIGHT_BASE_URL`, `HINDSIGHT_BANK` and `HINDSIGHT_API_KEY`. Then run:

```sh
npm run cloud:configure
```

This reads the private environment file and saves the server-side settings. It makes **zero provider calls**, refuses placeholder values and refuses to overwrite an existing connection. Review later changes in Connections. These environment variables alone do not configure the current UI workflow; the explicit save is required. Do not enable legacy provider-mode environment settings as a shortcut.

For a new setup, use a separate, bank-restricted, expiring key where your provider role permits it. Provider keys default to broader access unless you choose restrictions; a bank restriction is **not** a read-only restriction. See the provider's [API-key documentation](https://docs.hindsight.vectorize.io/api-keys/). Existing imported scope proofs have a stricter connection-binding limitation described below.

### Explicit new spending authorization

Start the app once to initialize its workspace identity, or import a private library first. Save the intended connection, then deliberately choose a cap. For example:

```sh
npm run cloud:authorize -- --cap-usd 10 --acknowledge-paid-usage
```

This example creates a **new** local $10 dispatch allowance; it does not purchase credit or verify a provider balance. The command accepts caps from $1 to $50, binds the ledger to the current workspace and exact saved connection, and refuses to overwrite an existing ledger. It reserves 40% for ingestion, 40% for evaluation/investigation, 10% for derived work and 10% as a buffer. It makes **zero provider calls**. Do not delete or reset a ledger to erase uncertain operations or imply renewed authorization.

A local ledger is a dispatch safeguard, not a provider-enforced spending limit, proof of available balance or least-privilege restriction on the API key. A copied key could be used outside this application. Cloud write paths exist for retention and derived-aid generation; an uncertain provider outcome can still incur cost. No automatic recharge or hidden retry is part of setup.

## Existing bank versus new workspace

Connecting a bank does not list and reconstruct the old local knowledge collection. Investigation eligibility depends on the canonical local article or document, its revision/hash, workspace identity, exact retained-document identity, connection identity and verified scope. Cloud facts alone do not supply that complete state.

To continue an existing collection, obtain a **private local metadata handoff** from its authorized owner. Keep its integrity checksum and source identities together. The destination must retain the intended workspace/source identity and establish its own matching connection and local authorization. The current connection identity includes a hash of the exact API key, bank and URL. A different key—even a new key for the same bank—makes imported scope proofs unverified. Automatic rebinding/reverification is not implemented. Do not share credentials casually to avoid this limitation; choose a controlled private continuation or a new bank/library workflow. Do not manually mark content retained, change hashes or invent scope proofs to bypass a mismatch.

A new workspace and your own new bank begin without the previous 247-article collection. Creating cases or approving local articles does not automatically upload them. Standalone paid connection tests and legacy manual retain/retry/retire buttons are paused; use only the explicit supported workflow. Private handoff does not transfer provider credentials, available balance or permission to spend.

### Private library export and import

Use the following commands only for a trusted, authorized private handoff. The paths below are relative examples; `.data/private-handoff/` is private material and must stay outside version control. Stop the destination application before import.

On the source installation, export from the existing workspace without modifying it:

```sh
npm run library -- export --workspace .data/lucid.sqlite --file .data/private-handoff/library.json --acknowledge-private-data
```

The command opens the source SQLite file read-only and writes a new private file exclusively. Its allowlist contains `workspaceId`, `articles`, `officialDocuments` and `historicalKnowledgeAssociations`. It excludes top-level cases, companies, credentials, budgets, raw report corpus and execution traces. Article objects and their nested provenance are preserved, so the owner must still inspect the bundle for private content before transferring it. A checksum detects accidental changes; it does not authenticate an untrusted sender or establish semantic safety.

On the destination, import into a **nonexistent** workspace database path:

```sh
npm run library -- import --workspace .data/library-workspace.sqlite --file .data/private-handoff/library.json --acknowledge-private-data
```

The import refuses an existing destination, verifies the bundle checksum/shape and duplicate identities, creates the normal nine fresh fixture cases, and preserves the library objects and workspace identity. It makes no provider calls, performs no fresh Cloud verification and imports no operational cases, credentials or budget. Configure `DATA_FILE=.data/library-workspace.sqlite` in the destination's private `.env` before starting that workspace.

The `library` command takes explicit paths and does not load `.env`; the runtime/configuration/authorization commands do. Save the intended server-side connection separately and create a new allowance with `cloud:authorize` only if you intend paid use. Known imported scopes are checked again when used, including the exact credential-connection binding. The local evidence database is not part of this bundle; full historical discussions can remain unavailable even when canonical article metadata is present.

An empty library/new bank requires a separate explicit curation and bounded retention workflow with reviewed source files. This release does not provide a one-click reconstruction of the excluded 247-article library from Cloud.

## Exposure and troubleshooting

There is no user login, multi-user authorization or production tenant boundary. Local host/origin checks and a request header reduce accidental cross-site actions; they do not turn this into an authenticated server. Keep it bound to loopback, restrict access to the host account and do not expose it publicly.

- **Unsupported SQLite/runtime error:** confirm a compatible Node version and reinstall with `npm ci` after changing runtimes.
- **Port already in use:** stop the other local instance or choose a different `PORT`.
- **No historical reports or cached documentation:** those downloads are excluded; an empty index is expected on a fresh clone.
- **Saved connection but no paid action:** settings are not budget authorization. Check the separate local allowance and connection/workspace identity.
- **Scope, source or connection mismatch:** preserve the files and inspect the handoff/verification record. Do not retry a write blindly.
- **AI verification failure:** existing drafts remain unchanged. The final live audit evaluation did not demonstrate reliable delivered output; see [quality](QUALITY.md). Repeated retries are not a setup fix.
