# Contributing to AI Tokenomics FinOps

Thank you for your interest in AI Tokenomics FinOps, a public runbook for optimizing the token and inference cost of generative AI and agentic AI workloads. Corrections, price updates, new levers, and site fixes from the community keep it accurate and useful.

This project is published as-is. It is a community sample, not official AWS documentation, and every claim in it is based on public sources.

Please read this guide before you open an issue or a pull request, so we have what we need to respond quickly.

## Ways to contribute

| You want to | Use |
|---|---|
| Fix something wrong, outdated, or unclear | The [Content correction](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=content-correction.yml) form, or the **Suggest a change** link on any section of the site |
| Update a model or service price | The [Pricing update](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=pricing-update.yml) form |
| Propose a new cost optimization lever | The [New lever proposal](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=new-lever.yml) form |
| Report a problem with the website | The [Site bug](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=site-bug.yml) form |
| Ask a question or discuss an idea | [GitHub Discussions](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/discussions) |
| Make the change yourself | A pull request from your fork (see below) |

Before you open an issue, please search existing open and recently closed issues to check that it has not already been reported. Blank issues are turned off, so every issue starts from one of the forms above.

For small fixes such as a typo or a broken link, you can skip the issue and open a pull request directly. For a new lever or any larger change, please open an issue or a Discussion first so we can agree on the approach before you spend time on it.

## Contributing via pull requests

1. Fork the repository and create a branch from the latest `main`.
2. Check existing open and recently merged pull requests to make sure nobody has already made the change.
3. Make your change. Keep each pull request focused on one change, and avoid reformatting unrelated content, because that makes the review harder.
4. Build the site and run the checks locally (see the next section).
5. Commit with a clear message and open a pull request against `main`. Fill in the pull request template, including the checklist.
6. Watch for automated check results on your pull request and stay involved in the conversation.

GitHub has guides on [forking a repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) and [creating a pull request from a fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork).

## Editing content and checking it locally

This section is the one place for the build and verify commands. Other docs link here rather than keep a copy.

### Repository layout

| Path | What it is |
|---|---|
| `content/index.html` | The runbook. Authored content (prose, levers, tables, citations, figures) plus two generated regions, the `<style>` and `<script>` blocks. It is a self-contained file you can open from disk. |
| `content/archive/` | The content baseline the verifiers diff against. See its README before changing it. |
| `site/src/css/`, `site/src/js/` | The runbook's presentation and behaviour as modules. `npm run build:runbook` bundles them into the generated regions of `content/index.html`. |
| `scripts/` | `build-runbook.mjs`, `build-site.mjs` and the three verifiers. |
| `site/static/` | Committed static assets copied into the site as-is: `og-image.png`, the 1200x630 link-preview image (regenerate with `scripts/make-og-image.mjs`). |
| `docs/assets/` | Images used by the README. Kept out of `site/static/` so they are not published to the site. |
| `tools/calculators/` | A stdlib-only Python resolver from Bedrock model IDs to AWS Price List rows, with tests. |
| `deck/` | The presenter deck, a self-contained [Bento](https://bento.page) file published at `/deck/`. See [deck/README.md](deck/README.md) to present or edit it, and for its public-safety rule. |
| `dist/` | Build output (git-ignored). This is what is published to GitHub Pages, including the canonical, Open Graph and JSON-LD head tags, `sitemap.xml` and `robots.txt` that `build-site.mjs` emits. |

Never edit inside the `@generated:*` markers in `content/index.html`: the next build overwrites them.
Edit `site/src/` and rebuild.

### Build and verify

Requires Node.js 22.12 or later (CI uses 22) and, for the browser checks, a Chrome or Chromium binary.

```bash
npm ci
npm run build        # site/src -> content/index.html, then content/index.html -> dist/
npm run verify       # static + facts + headless-browser checks
```

`npm run verify` has four parts:

- `verify:static` checks that every lever, question, table, citation, `id` and external URL in the
  baseline is still present, plus the build invariants (one `<style>`, one `<script>`, no inline styles,
  no network primitives, no internal hosts).
- `verify:facts` checks that every quantity, price, code identifier and citation in the baseline is still
  in the section that owns it.
- `verify:dom` drives headless Chrome over both the self-contained file and the built site. The site is
  served under the Pages sub-path `/sample-aws-ai-tokenomics-finops/` with the production
  Content-Security-Policy, and the run fails on any console error, CSP violation or off-origin request.
- `verify:deck` checks the presenter deck: it decodes the deck's document and fails on internal markers,
  hosts or aliases, account-like numbers, live-session keys, hidden slides, remote resources and slide-count
  drift, then steps through every slide of the published copy in headless Chrome under the deck's CSP. See
  [deck/README.md](deck/README.md).

`verify:dom` looks for Chrome in the usual places; point it at a specific binary with
`PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm run verify:dom`. Screenshots and print PDFs land in
`.verify-out/`.

To preview the built site:

```bash
npm run build
mkdir -p /tmp/pages && ln -sfn "$PWD/dist" /tmp/pages/sample-aws-ai-tokenomics-finops
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/pages
# then browse to 127.0.0.1:8000/sample-aws-ai-tokenomics-finops/
```

The calculator tests need only Python 3.9 or later: `npm run test:calculators`.

Before you open a pull request, run `npm run verify` and make sure it passes. The same checks run in CI on every pull request, and a pull request cannot be merged until they are green.

### Deployment

`.github/workflows/ci.yml` runs the build and every verify gate on each pull request and on `main`, and
uploads the built site as a `site-preview` artifact on pull requests. `.github/workflows/pages.yml`
builds and deploys `dist/` to GitHub Pages on every push to `main`.

## Writing and citation style

- **Public sources only.** Every fact, figure, and recommendation must be supported by a public source, such as AWS documentation, a public pricing page, a published paper, or a public benchmark. Link the source next to the claim it supports.
- **No private information.** Do not include customer data, internal or confidential information, account IDs, private or negotiated prices, or credentials, even as examples. Use clearly invented placeholders instead.
- **Prices carry an as-of date.** Every price names the public pricing page it comes from and the date you read it, for example "as of 2026-10-01". Include the Region and pricing dimension where they matter.
- **Show the arithmetic.** When you state a saving, give the assumptions and the calculation so a reader can rerun it with their own numbers.
- **State facts, not value judgements.** Describe what a technique does, what it costs, and what it saves. Avoid labels such as "cheap", "best", or "highest priority", and avoid judgements about vendors or products. Readers weigh the trade-offs for their own workloads.
- **Write plainly.** Use complete sentences, short paragraphs, and consistent terminology with the rest of the runbook.

## Review and merge policy

- Every pull request needs approval from a maintainer listed in [CODEOWNERS](.github/CODEOWNERS) and green CI before it can be merged.
- Maintainers merge pull requests from external contributors. Please do not ask for a merge before review is complete.
- A maintainer may ask for a public source, label the issue or pull request `needs-source`, and wait for it before merging.
- Maintainers triage new issues, which start with the `needs-triage` label. Issues labelled `good first issue` or `help wanted` are a good place to start if you would like to contribute.
- We may close issues or pull requests that are out of scope, that cannot be supported by public sources, or that have had no response for an extended period.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.
