# AI Tokenomics FinOps

A GenAI FinOps self-assessment runbook for AI cost optimization on AWS, focused on Amazon Bedrock cost
optimization and the LLM token cost of AI coding assistants and agentic AI applications. Generative AI is
billed by the token, so cost follows usage directly and rises as adoption spreads. This runbook sets out
the decisions that move the bill for two kinds of team, as two tracks:

- **Track 1, AI Coding Assistant:** teams that adopt an AI coding assistant and tune how it is used.
- **Track 2, Purpose-Built Agentic AI Application:** teams that build and operate an agent of their own on
  Amazon Bedrock.

Each track is organised into actor layers and levers. For every lever you answer a few diagnostic
questions (Fully covered, Partially, Not covered, N/A), open the detailed guidance only where there is a
gap, and export a per-layer gap report.

**Live site:** [aws-samples.github.io/sample-aws-ai-tokenomics-finops](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/)

> This is sample guidance published as-is under the MIT-0 licence. It is not official AWS documentation
> and is not supported by AWS. Prices and service features change; confirm figures against the linked AWS
> pages before relying on them. All dollar figures in the runbook are illustrative unless dated and cited.

## How report generation works

Everything runs in your browser. The site is a static page with no backend, no sign-in, no analytics and
no network calls of its own (the build enforces this under a strict Content-Security-Policy).

- Your answers and notes are saved in your browser's `localStorage`, so they survive a reload on the same
  device and browser. Nothing is sent anywhere.
- Each track's dashboard has **Download Markdown report**, which saves the raw report as a `.md` file:
  a dated header, coverage counts, the gaps to address with links back to the guidance, and every
  answered question with your notes. **Copy assessment summary** puts it on the clipboard instead.
- **Print assessment** (and **Export as PDF** on each layer's summary panel) builds a print view of the
  same report and opens your browser's print dialog, so you can save it as PDF.
- Each layer's summary panel has **Copy report** and **Download .md** for that layer's report alone.
- Reports are dated, not attributed: there is no sign-in, so the header says when the assessment was run.

## Repository layout

| Path | What it is |
|---|---|
| `content/index.html` | The runbook. Authored content (prose, levers, tables, citations, figures) plus two generated regions, the `<style>` and `<script>` blocks. It is a self-contained file you can open from disk. |
| `content/archive/` | The content baseline the verifiers diff against. See its README before changing it. |
| `site/src/css/`, `site/src/js/` | The runbook's presentation and behaviour as modules. `npm run build:runbook` bundles them into the generated regions of `content/index.html`. |
| `scripts/` | `build-runbook.mjs`, `build-site.mjs` and the three verifiers. |
| `site/static/` | Committed static assets copied into the site as-is: `og-image.png`, the 1200x630 link-preview image (regenerate with `scripts/make-og-image.mjs`). |
| `tools/calculators/` | A stdlib-only Python resolver from Bedrock model IDs to AWS Price List rows, with tests. |
| `dist/` | Build output (git-ignored). This is what is published to GitHub Pages, including the canonical, Open Graph and JSON-LD head tags, `sitemap.xml` and `robots.txt` that `build-site.mjs` emits. |

Never edit inside the `@generated:*` markers in `content/index.html`: the next build overwrites them.
Edit `site/src/` and rebuild.

## Build and verify locally

Requires Node.js 18 or later (CI uses 22) and, for the browser checks, a Chrome or Chromium binary.

```bash
npm ci
npm run build        # site/src -> content/index.html, then content/index.html -> dist/
npm run verify       # static + facts + headless-browser checks
```

`npm run verify` has three parts:

- `verify:static` checks that every lever, question, table, citation, `id` and external URL in the
  baseline is still present, plus the build invariants (one `<style>`, one `<script>`, no inline styles,
  no network primitives, no internal hosts).
- `verify:facts` checks that every quantity, price, code identifier and citation in the baseline is still
  in the section that owns it.
- `verify:dom` drives headless Chrome over both the self-contained file and the built site. The site is
  served under the Pages sub-path `/sample-aws-ai-tokenomics-finops/` with the production
  Content-Security-Policy, and the run fails on any console error, CSP violation or off-origin request.

`verify:dom` looks for Chrome in the usual places; point it at a specific binary with
`PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm run verify:dom`. Screenshots and print PDFs land in
`.verify-out/`.

To preview the built site:

```bash
npm run build
mkdir -p /tmp/pages && ln -sfn "$PWD/dist" /tmp/pages/sample-aws-ai-tokenomics-finops
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/pages
# open http://127.0.0.1:8000/sample-aws-ai-tokenomics-finops/
```

The calculator tests need only Python 3.9 or later: `npm run test:calculators`.

## Deployment

`.github/workflows/ci.yml` runs the build and every verify gate on each pull request and on `main`, and
uploads the built site as a `site-preview` artifact on pull requests. `.github/workflows/pages.yml`
builds and deploys `dist/` to GitHub Pages on every push to `main`.

## Contributing

Corrections and new evidence are welcome. Every lever on the site has a **Suggest a change** link that
opens a prefilled issue for that section. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose
changes and how pull requests are reviewed.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This sample is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
