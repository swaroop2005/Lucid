# MVP demo: default workflow and experimental investigation

Lucid is an MVP, and reliable generated investigation advice is not established. The recording work used a privately isolated instance with an explicitly injected experimental engine. A normal clone does **not** reproduce that instance, its verified source library, paid allowance or results.

## Which path runs

| Path | Engine | Behavior |
| --- | --- | --- |
| `npm run dev` / `npm start` | Default `audit-v1` | Candidate Reflect, provenance checks, then a mandatory second evidence-audit Reflect. Only validated diagnostic output is delivered. |
| Explicit constructor injection below | Experimental `plan-v3-raw` | One Reflect returns primary-text JSON, followed by parsing, source/provenance and plan validation. It does not run the second audit. |
| Private recording instance | Explicit `plan-v3-raw` injection plus private restrictions | Isolated copied state, a fixed case, one attempt per arm and a separate reservation ceiling. This harness and its state are excluded from the repository. |

The public implementation already contains both protocols in [hindsight-investigation.js](../server/hindsight-investigation.js). [app.js](../server/app.js) accepts `dependencies.hindsightInvestigation`; otherwise it constructs the default engine. There is no protocol switch in Connections or environment variable that selects the experimental path. This document does not promote it to the default.

## Reproduce the public code path with your own authorized state

1. Follow [Setup](SETUP.md): install Node.js 22.13 or newer, run `npm ci`, initialize your local workspace, configure your own Hindsight connection and deliberately authorize an allowance. Settings alone grant no spending authority.
2. Supply your own reviewed sources. Memory eligibility requires matching canonical local records, connection identity and verified Cloud originals. Recover/reverify an authorized archive or use the documented private handoff; merely connecting a bank does not recreate the recording's library. Do not invent verification fields.
3. In a separate local checkout, explicitly select the experimental engine. In `server/index.js`, add these imports:

```js
import { CloudWorkflow } from './cloud-workflow.js';
import { HindsightInvestigation } from './hindsight-investigation.js';
```

After the existing authorizer and checkpoint-budget declarations, replace the existing `createApp` declaration with:

```js
const cloud = new CloudWorkflow(store, settings);
const investigation = new HindsightInvestigation(store, cloud.provider(), {
  connectionId: () => cloud.connectionId(),
  authorize: authorizeHindsight,
  protocol: 'plan-v3-raw',
});
const { app, worker, learning, cloudWorkspace } = createApp(store, config, {
  evidence,
  settings,
  cloudWorkflow: cloud,
  hindsightInvestigation: investigation,
  authorizeHindsight,
  authorizeCloudWorkspace,
  cloudWorkspaceOptions: {
    canSpend: checkpointBudget.canSpend,
    budgetStatus: checkpointBudget.status,
  },
  cloudRequired: process.env.NODE_ENV !== 'test',
});
```

Keep the surrounding startup, serving and shutdown code. Run `npm run dev` and use the local case investigation controls with explicit credit acknowledgement. Both memory-disabled and memory-enabled live investigations use Hindsight Reflect; disabling memory does not make the live baseline a local template. Memory-enabled runs additionally use eligible scoped sources and Recall. The route is `POST /api/cases/:id/analyze`, with `useHindsight: true`, `acknowledgeCreditUse: true`, `useMemory` and `searchDepth` (`mid` or `high`). Use the UI to preserve the existing local request protections.

This integration example preserves ordinary application behavior. It does **not** recreate the private harness's fixed-case lock, single-attempt journal, disabled write routes or saved-baseline viewer. Normal authorized checkpoint/learning behavior still applies as described in Setup. Do not treat the example as an isolated experiment or reuse someone else's credentials or ledger. No provider request is needed to inspect or test this wiring with fake providers.

## What the actual pair showed

The actual Cloud baseline returned HTTP 200, but its delivered artifact-upload HTTP 500 hypotheses cited REF-07, an artifact-download reference. Protocol completion and source membership did not establish claim support.

The memory arm performed Recall and source verification, then returned HTTP 422. The generated candidate was withheld for disallowed guidance. Review identified a historical recovery used as conditional-resolution authority, a helper-flavor mutation and an unsupported exclusion. Relevant retrieval did not produce a valid delivered memory answer. One retrieved lesson came from the same historical source as the displayed case, so this was not an independent held-out test.

There was no answer-quality win, automatic retry or local fallback. The separately completed file Retain/Recall demonstration established source storage and lookup, not investigation accuracy. A later local generation-instruction/schema revision was tested offline; it is not included by this documentation change and is not evidence of a repaired live result. See [Quality](QUALITY.md) for the distinct earlier pilot results.

## Code and evidence boundaries

[Investigation plan](../server/investigation-plan.js) builds the prompt, parses primary JSON, validates source handles and restricts conditional-resolution authority. [Its tests](../tests/investigation-plan.test.js) check those contracts; lexical guards are not semantic proof. [Budget authorization](../server/hindsight-budget.js) reserves before dispatch against the user's matching private ledger. Failures preserve earlier drafts and private phase records.

The public export excludes recording launchers, isolated databases, provider receipts, raw candidates, private evaluation gold, credentials and spending authority. Software tests and a visually complete recording cannot substitute for independent source-aware answer review.
