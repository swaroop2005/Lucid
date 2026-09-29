# Versioned GitLab Runner reference documentation

This package contains 68 cached official documentation pages for 10 GitLab Runner versions. The source index contains 80 attempted page/version combinations: 68 available and 12 unavailable. It is a selected reference cache, not every page of every product version and not a knowledge-article library.

## Attribution and license

Copyright belongs to GitLab B.V. and the GitLab Runner contributors. Each record in `index.json` links directly to its original tagged file and records the fetch timestamp. The upstream [contribution notice](https://github.com/gitlabhq/gitlab-runner/blob/main/CONTRIBUTING.md) identifies the repository's docs directory as [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The full license is in `LICENSE-CC-BY-SA-4.0.txt`. This license applies to the included upstream documentation and its documented adaptations, not to Lucid's whole codebase or user-authored issue discussions.

Ten pages contain an upstream example private-key placeholder. Its BEGIN/END markers were replaced with `[example private key omitted]`; no real key material was present in those placeholders. No technical prose was changed. `sourceSha256` records the original cached file hash, `sha256` records the distributed file hash, and `modifications` describes the change per page. Preserve this attribution, the source links, modification notices and license when redistributing.

Relative image and documentation links in these Markdown files may point outside this selected cache. For full navigation use the original source or official documentation. Cached versioned text can be outdated; verify its applicability.

## Verify and install locally

From the Lucid repository root:

```sh
npm run dataset:verify
npm run dataset:verify -- --install-docs
```

Verification checks all report/discussion identities and file hashes without network calls. Installation copies the verified documentation into the ignored `data/versioned-docs/` cache and creates `data/versioned-docs.json`, which the existing version-aware reference selector reads. Existing different files are never overwritten. Stop the app and use a clean checkout or deliberately move an old cache aside if there is a conflict. No Hindsight calls, paid operations or knowledge-article imports occur.

A successful install provides version-matched documentation where a cached version and section exist. It does not populate historical issue bodies, transfer a private workspace or make the application publicly hosted.
