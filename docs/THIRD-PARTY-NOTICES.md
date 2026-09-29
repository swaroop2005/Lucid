# Third-party notices

## Application code

This document does not grant or invent a license for Lucid's application code. A public repository and an npm `private` flag are not license grants. Refer to any license the project owner separately provides before redistributing or using the application under assumed terms.

## GitLab Runner material

The project references public GitLab Runner issues and official documentation and includes reconstructed source-based fixtures. For GitLab Runner software covered by its MIT license, retain the supplied copyright and permission notice:

- [GitLab Runner MIT notice](GITLAB-RUNNER-LICENSE.txt)

That notice applies to the material covered by its terms. It does not automatically license all issue comments, every GitLab web page or this application's original code. Source links and review labels describe provenance; they do not establish a blanket redistribution license.

A metadata-only [public source index](../data/public-dataset/README.md) is included, with source URLs, dates and derived categories. Original reports are credited to their GitLab Runner community contributors. The downloaded report bodies/discussions and prepared retained knowledge collection are not included in the public package. Source pointers for 58,495 non-system discussion notes are included without their text or authors. The optional download tool obtains current public descriptions directly from GitLab into ignored local storage; it grants no redistribution rights. Any later private import should preserve its source attribution and applicable notices.

The upstream [contribution notice](https://github.com/gitlabhq/gitlab-runner/blob/main/CONTRIBUTING.md) identifies documentation under its docs directory as CC BY-SA 4.0. Do not assume the software MIT notice covers all documentation or community issue content. The [reference documentation package](../data/public-reference-docs/README.md) reproduces 68 versioned documentation pages under CC BY-SA 4.0, with source links, original/distributed hashes and modification notices. Ten upstream example private-key placeholders have been replaced by textual omissions. The license applies to that documentation material and its adaptations. Issue prose is not republished.

## JavaScript dependencies

Runtime and development dependencies are declared in `package.json` and pinned by `package-lock.json`. They retain their respective upstream licenses. Inspect each installed package's license/notice files before redistributing a bundle; this document does not replace those notices or claim all dependencies share one license.

The implementation uses React, Vite, Express, SQLite through the Node.js runtime, the Hindsight JavaScript SDK, and supporting UI, validation and test libraries. Browser downloads used by the test suite have their own distribution terms.

## Names and services

GitLab, GitLab Runner and Hindsight names identify referenced products and services. This project does not claim affiliation, sponsorship or endorsement. Service access, API usage and billing remain subject to the respective provider's terms.
