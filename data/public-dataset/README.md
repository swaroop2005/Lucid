# Lucid public report dataset

This directory publishes the **complete source index for the 8,348 historical public reports in Lucid's local research collection**. It contains factual metadata and a source link for every indexed report. It does not contain the report bodies, discussion comments, private workspace, 247-article knowledge library, or evaluation answers.

These are reports from the **GitLab Runner community**, not 8,348 Lucid customer cases, verified fixes or benchmark examples. Credit for the original reports and discussions belongs to their contributors. Lucid assembled the index and assigned rough topic categories. GitLab does not endorse this project.

## Source and attribution

- Original project: [GitLab Runner](https://gitlab.com/gitlab-org/gitlab-runner)
- Original reports: [GitLab Runner public issue tracker](https://gitlab.com/gitlab-org/gitlab-runner/-/issues)
- Collection interface: [GitLab Issues API](https://docs.gitlab.com/api/issues/)
- Applicable service terms: [GitLab API terms](https://handbook.gitlab.com/handbook/legal/api-terms/)
- Existing collection logic: [ingest-public-reports.js](../../scripts/ingest-public-reports.js)

Each record retains its original public URL. GitLab may display issue URLs as work-item URLs; both forms refer to the same project and numeric issue identity. The download tool always constructs the fixed project's API endpoint from that number.

## Files and schema

| File | Contents |
|---|---|
| reports.jsonl | 8,348 records, one JSON object per line, ordered by numeric issue ID |
| manifest.json | Record count, checksum, date coverage, category counts and limitations |
| discussions/part-*.jsonl | 58,495 non-system note identities, source URLs, dates and local truncation flags |
| discussion-coverage.jsonl | Per-report counts and recorded collector status for all 8,348 reports |
| discussion-manifest.json | Discussion part checksums, totals and limitations |

Every record in `reports.jsonl` has only these seven fields:

| Field | Meaning |
|---|---|
| id | Lucid's source identity, derived from the GitLab issue number |
| issueIid | Project-local GitLab issue number |
| url | Original public report URL |
| createdAt | Report creation timestamp recorded in the local collection |
| updatedAt | Upstream modification timestamp observed by the collector, not the download time |
| state | Upstream opened/closed state observed by the collector |
| family | Lucid's keyword-derived topic category, not an expert annotation |

No usernames, email addresses, issue titles, report prose, comments, logs, credentials, API keys, source-derived resolution answers or local database files are included. This narrow metadata representation avoids distributing unreviewed free text. The report index is roughly 2 MB. The expanded metadata package can also be inspected without cloud credentials.

## Coverage and collection method

The stored reports were created between **15 November 2014 and 26 September 2026**. There are **5,786 closed** and **2,562 opened** reports in the recorded snapshot. These counts describe the local collection exported for this publication, not the complete current issue tracker. Closed status does not establish resolution.

The collection script pages the public project Issues API in descending creation order, ignores confidential or malformed records, requires a substantive description, and filters titles/labels for runner, failure, bug or support-related terms. It assigns the first matching category using title and labels, then the beginning of the description. Its text cleaner replaces common credential/email patterns and limits text length. These are heuristics, not comprehensive redaction or expert labeling.

The local checkpoint records source exhaustion on 27 September 2026. A complete original page-by-page acquisition log and per-record collection timestamps are not available. The manifest's export timestamp describes this metadata export. It is not a claim that all source text was fetched at that moment. The preserved source IDs, source modification timestamps and index checksum make the selection inspectable; they do not reproduce the original text byte for byte.

## Download the report text into your own local Lucid

A fresh clone can inspect this index offline. To populate the Historical cases view with source text, first install dependencies following [Setup](../../docs/SETUP.md). Run from the repository root:

```sh
npm run dataset:fetch
```

That validates the complete index and previews a 25-record batch. It performs **zero network requests and zero database writes**.

To explicitly fetch those reports from GitLab:

```sh
npm run dataset:fetch -- --fetch --offset 0 --limit 25
```

The script prints `nextOffset`. Continue in bounded batches, using that value:

```sh
npm run dataset:fetch -- --fetch --offset 25 --limit 100
```

The maximum is 100 records per invocation, processed sequentially with a pause between requests. Existing records are preserved. Removed, inaccessible or confidential records are skipped and counted. A rate limit, network error or unexpected source schema stops the batch without retry, and reports the offset to resume after addressing the error. Respect upstream rate limits. No credentials are required or sent by this tool.

The fetched title and description are cleaned by Lucid's existing text sanitizer, then imported into the local evidence index. The default file is `.data/evidence.sqlite`; an explicit `EVIDENCE_FILE` environment variable can select a separate database. Refresh the Historical cases view to see fetched records. Downloads remain ignored by Git and are not published by this command. Pattern-based cleaning is not a guarantee that all sensitive information is removed; inspect source text before sharing it.

This fetches **current publicly available issue titles and descriptions for the indexed IDs**. It does not reproduce earlier versions exactly, fetch discussion comments, automatically create knowledge articles, upload to Hindsight, train a model, or consume AI credits. Use cloud recovery separately for an authorized knowledge library. A complete 8,348-record refetch has not been run as part of publishing this index.

## Rights and limitations

Public visibility is not a blanket license grant for third-party issue prose. This package does not apply GitLab Runner's software license to user-authored reports or comments. Follow each source's terms and rights before redistributing its content. GitLab Runner code, documentation and community contributions can have different applicable terms; see [third-party notices](../../docs/THIRD-PARTY-NOTICES.md).

The index establishes source traceability. It does not demonstrate model accuracy, successful case resolution or improved reasoning from memory. Some Lucid examples were reconstructed from reports in this collection, and some reports concern features rather than failures. Do not call the collection an independent held-out benchmark or treat source-reported recovery as independently reproduced truth.

Suggested attribution: "Lucid's research collection indexes 8,348 public reports from the GitLab Runner project. Original reports and discussions were contributed by the GitLab Runner community; Lucid provides source links and derived topic categories."

## Discussion provenance and reference documentation

The local collection contains 123,209 notes in total. This publication indexes the 58,495 non-system notes; 64,714 automated system notes are counted in coverage but not individually exported. Six JSONL parts contain only `noteId`, `reportId`, `url`, `createdAt`, `updatedAt`, and `textWasTruncatedLocally`. These are pointers to upstream discussion, not comment text, authors or extracted resolution claims. Collector status describes the recorded local run, not proof that every comment is still accessible or historically complete.

The separate [versioned reference package](../public-reference-docs/README.md) includes 68 official documentation pages with source URLs, per-file hashes, attribution and CC BY-SA 4.0 notices. These are product documentation, not Lucid's knowledge articles.

```sh
npm run dataset:verify
npm run dataset:verify -- --install-docs
```

Both commands operate locally with zero provider calls. To retrieve current discussion text after fetching report descriptions, the existing collector can run an explicitly bounded one-report batch:

```sh
ENRICH_CONCURRENCY=1 ENRICH_INTERVAL_MS=1000 npm run enrich:public -- --limit=1
```

A report can have many discussion pages. This limit bounds reports, not HTTP requests or comment count. The collector resumes local jobs and may fetch linked public evidence. It does not reproduce the exact original snapshot, create approved knowledge articles or upload memory. Respect source availability, terms and rate limits. Keep downloaded text private unless its redistribution is permitted. The included metadata does not automatically hydrate the discussion database.
