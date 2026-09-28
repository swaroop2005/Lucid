# Case-to-knowledge workflow

## Capture and investigate

1. Open or create a case. Record the environment, exact known versions, symptoms, failed attempts and current observations. Unknown values remain unknown.
2. Save authored edits. Local persistence succeeds independently of Cloud completion. A committed operational change queues a bounded checkpoint when Cloud configuration, ownership and existing allowance permit it. Connections shows pending state and the whole-save estimate.
3. Configure the intended Hindsight connection and explicit allowance before preparation. Normal runtime requires Cloud; the offline rehearsal is an isolated test feature.
4. Request preparation with the intended memory mode and retrieval depth. Historical knowledge and exact-version official sources remain separate from current observations. Deep search does not choose a stronger hosted model.
5. Review the delivered result. A private candidate undergoes the mandatory evidence audit. Invalid results are withheld and prior drafts stay intact. The runtime protocol is still `audit-v1`; the experimental semantic-plan protocol is not promoted.
6. Edit the draft and decide on next diagnostic steps. The application does not send the response or execute proposed fixes. Record actual attempted steps and resulting observations separately.

The latest developmental outputs were not reliable: all five delivered outputs in eight attempts contained material errors. Use [quality findings](QUALITY.md) when judging what an accepted result means.

## Resolve, review and learn

Record the observed outcome and its supporting evidence. A resolution draft is not automatically trusted knowledge. Explicitly approve the resulting article only after checking its cause, fix, verification, version scope and provenance.

Approval queues a deterministic learning closeout for that article revision. With matching authority, the worker automatically retains the approved outcome and verifies the exact original content. There is no separate manual upload step for this reviewed-outcome path. An already approved queued closeout can resume at startup or after connection settings change.

The article shows **pending**, **processing**, **unverified** or **succeeded** separately from operational checkpoint status. A pending or uncertain result is not successful learning. Status checks reconcile the recorded attempt and never blindly resend an uncertain write. Editing the approved article creates a different revision; old proof cannot authorize the changed content.

Generated drafts, failed suggestions and model claims without approved outcome evidence do not become knowledge. Bulk historical curation remains a separate explicit reviewed batch workflow. Derived aids remain unreviewed and are excluded from case investigation evidence.

## Save, hand off and recover

Operational checkpoints preserve canonical cases, authored drafts, tasks, events and library records. They use a scope separate from approved knowledge; storing a draft in a recoverable archive does not make it investigation evidence.

The queue coalesces committed saves, checks the entire estimated batch against existing total and ingestion allowance, and limits new documents and follow-up work. Reservations are conservative estimates, not billed charges. Startup and local status polling alone do not start operational checkpoint calls; this does not disable the separate approved-learning resume path.

Manual staging/publication remains available for reconciliation or explicit owner handoff. Another recorded owner disables publication and blocks operational edits. One cooperating editor is supported; handoff is not a distributed locking mechanism.

On a destination installation, save the intended connection and provide the existing workspace/owner identities. Preview verifies complete Cloud originals and returns counts. Apply requires explicit replacement confirmation, repeats the reads, checks drift and saves a private backup first. Recovered knowledge stays ineligible until fresh source reverification matches its exact identity, original text and nonzero facts on the destination connection. A new paid allowance must be deliberately authorized for the recovered workspace before later paid work.

A bank containing only extracted facts or historical knowledge documents is not a full operational backup. This repository does not claim a particular live migration succeeded. See [Cloud checkpoints and recovery](CLOUD-WORKSPACE.md) for bounds and [setup](SETUP.md) for private handoff alternatives.
