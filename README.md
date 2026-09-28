# Lucid

Lucid is a local support-investigation prototype focused on GitLab Runner. It keeps a report, environment details, attempted steps, source evidence and editable responses together. Historical knowledge, exact-version official guidance and current-case observations remain separate.

**Status:** local workflows and source-verification controls are implemented. Reliable AI investigation and resolution are not established. The final audit-only pilot delivered **0/12** results; the final paired fresh-case evaluation delivered **0/4**. The application withholds invalid results instead of presenting an unsupported fix. See [quality and limitations](docs/QUALITY.md).

## Run locally

Requires Node.js **22.13 or newer**, npm and a supported desktop browser. The release preparation used Node.js **22.22.1** and npm **9.2.0**. Run commands from the repository root:

```sh
git clone https://github.com/swaroop2005/Lucid.git
cd Lucid
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. First launch creates a local SQLite workspace with **nine reconstructed public-source fixture cases**. These are demonstration exercises, not a copy of anyone's operational workspace. No AI credentials or paid provider calls are needed for the default local workflow.

```sh
npm run build
npm start
```

The production command serves the built interface on the same loopback address. The application is an unauthenticated local prototype; do not expose it through a public host or tunnel.

## What you can do

- Record a report, environment details, attempted steps and outcome evidence.
- Prepare local template responses and inspect source references.
- Maintain reviewed local knowledge with explicit provenance and applicability limits.
- Optionally connect Hindsight for strictly scoped retrieval and two-stage AI investigation: a private candidate followed by a mandatory evidence audit.
- Inspect exact-version official sources and manually requested derived aids when their required local metadata is present.

The AI result mode is deliberately limited to diagnostic questions, attributed conditional hypotheses and labeled reported observations. A supported audit verdict does not automatically approve a prescription. Drafts are editable and unsent; the app does not execute a proposed fix.

## Optional Hindsight connection

Save the Cloud endpoint, your bank identifier and API key through **Connections**. Credentials are stored in a server-side local file, not browser storage. The current endpoint is fixed to `https://api.hindsight.vectorize.io`.

Saving a connection does not upload knowledge or authorize spending. A separate, explicit local budget authorization is required before paid requests. The key is not restricted by this application to read-only or least-privilege access: operations can incur charges and some workflows write to Cloud. Follow [setup](docs/SETUP.md) before enabling them.

A fresh clone does **not** include the previously prepared 247-article library, five retained official-document records, downloaded report corpus or versioned-document cache. An existing Cloud bank cannot reconstruct the application's local article content, source metadata, workspace identity and scope proofs by itself. Continuing an existing workspace requires a private metadata handoff; using your own new bank starts without that library. No credentials, prior spending authorization or credit balance are included in this repository. Small authored research fixtures and source-identity exclusions are included; they are not the downloaded report corpus.

## Development checks

```sh
npm test
npm run lint
npm run build
npm run test:e2e
```

Install its bundled Chromium first with `npx playwright install chromium`; see [setup](docs/SETUP.md). Unit and browser tests use isolated fixtures and fake provider responses. Their success is not evidence that live model answers are correct.

## Documentation

- [Setup and private-state handling](docs/SETUP.md)
- [Architecture and source boundaries](docs/ARCHITECTURE.md)
- [Case-to-knowledge workflow](docs/WORKFLOW.md)
- [Quality results and known limits](docs/QUALITY.md)
- [Third-party notices](docs/THIRD-PARTY-NOTICES.md)

This repository does not assign a new license to the application code. Third-party material retains its own terms and notices.
