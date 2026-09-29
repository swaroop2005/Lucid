# Lucid

Lucid is a local support-investigation prototype focused on GitLab Runner. It keeps reports, environment details, attempted steps, source evidence and editable responses together. Historical knowledge, exact-version official guidance and current-case observations remain separate.

**Status:** local workflows, Cloud archive/recovery controls and reviewed-outcome learning are implemented. Reliable AI investigation and resolution are **not established**. In the latest developmental comparison, 5 of 8 attempts delivered output; all five had material errors and averaged 3.4/10. A new 50-case cohort is prepared but has not been executed. The experimental protocol has not been promoted to the normal runtime. See [quality](docs/QUALITY.md).

## Run locally

Requires Node.js **22.13 or newer**, npm and a supported browser:

```sh
git clone https://github.com/swaroop2005/Lucid.git
cd Lucid
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. First launch creates nine reconstructed public-source fixture cases. You can inspect and edit local records without credentials; normal investigation preparation requires a configured Hindsight connection and explicit local spending authorization. The isolated test server alone enables the offline rehearsal bypass.

```sh
npm run build
npm start
```

This serves the built interface on loopback. The application has no user authentication; do not expose it publicly.

## Current workflows

- Record reports, failed attempts, tasks, drafts and outcome evidence. Drafts remain editable and unsent.
- Request bounded Hindsight investigation with a private candidate and mandatory evidence audit. Normal runtime uses the existing `audit-v1` protocol; the developmental semantic-plan protocol remains unpromoted.
- Review knowledge with explicit provenance and applicability limits. Explicitly approved outcomes queue learning automatically; generated drafts and failed suggestions are not knowledge.
- Archive committed operational saves through a bounded, coalescing Cloud checkpoint queue. Connections shows the complete save estimate and remaining local allowance. Pending or unverified does not mean saved successfully to Cloud.
- Preview and explicitly recover a verified operational archive; then reverify knowledge originals for the destination connection. Manual checkpoint and owner handoff controls remain available.

A workspace has one cooperating editor. Owner handoff detects observed competing history but is not authentication, a distributed lock or a transactional database. See [Cloud checkpoints and recovery](docs/CLOUD-WORKSPACE.md).

## Cloud setup and private state

Save your Hindsight endpoint, bank and key in **Connections**, then deliberately authorize paid usage through the supplied local setup command. Settings alone grant no spending authority. An operational save can initiate a checkpoint once existing authority permits the complete batch; reservations are estimates, not bills or a provider-enforced balance. Approved learning queued earlier can resume at startup or after connection changes. Operational checkpoints themselves do not start merely because the app boots or a status page polls.

A fresh clone includes small synthetic/authored fixtures, not downloaded report discussions, versioned-document caches, the earlier 247-article private library, credentials or prior spending authorization. Cloud facts alone cannot reconstruct canonical records. A complete verified operational archive can be recovered through the new recovery workflow; otherwise a controlled private library handoff remains available. This repository does not claim that any particular live bank has completed migration.

Follow [setup](docs/SETUP.md) before enabling paid work. All operational databases, Cloud credentials, budget ledgers, private backups and evaluation traces stay outside version control.

## Development checks

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use isolated stores and fake provider responses. Passing software tests does not prove live answer accuracy or a completed live migration.

## Documentation

- [Setup and private-state handling](docs/SETUP.md)
- [Architecture and source boundaries](docs/ARCHITECTURE.md)
- [Case-to-knowledge workflow](docs/WORKFLOW.md)
- [Cloud checkpoints and recovery](docs/CLOUD-WORKSPACE.md)
- [MVP demo: default versus experimental investigation](docs/MVP-DEMO.md)
- [Quality results and known limits](docs/QUALITY.md)
- [Third-party notices](docs/THIRD-PARTY-NOTICES.md)

This repository does not assign a new license to the application code. Third-party material retains its own terms and notices.
