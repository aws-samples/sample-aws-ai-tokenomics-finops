# AI Tokenomics FinOps

**Find the decisions that move your AI token bill.**

A browser-only self-assessment runbook for teams that use AI coding assistants or build agents on
Amazon Bedrock. 28 levers across 2 tracks. Answer the diagnostic questions, export a gap report.

**[Open the runbook](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/)** ·
[Contributing](CONTRIBUTING.md) ·
[Suggest a lever](https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=new-lever.yml)

> This is sample guidance published as-is under the MIT-0 licence. It is not official AWS documentation
> and is not supported by AWS. Prices and service features change; confirm figures against the linked AWS
> pages before relying on them. All dollar figures in the runbook are illustrative unless dated and cited.

![Demo: pick Track 1, answer a lever's questions and read the guidance for a gap; then, with the rest of the track answered, open Track 1 progress and gaps and download the gap report](docs/assets/demo.gif)

## Who it's for

| Track | For teams that | Levers |
|---|---|---|
| 1. AI Coding Assistant | adopt an AI coding assistant and tune how it is used | 11 |
| 2. Purpose-Built Agentic AI Application | build and operate their own agent on Amazon Bedrock | 17 |

Each track groups its levers into three actor layers: Model Inference, Agent Harness, End User.

## How to use the runbook

1. Open the [live site](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/). No install, no clone.
   For offline use, download [`content/index.html`](content/index.html) (**Download raw file**) and open it
   from disk.
2. Pick your track. "Which track am I in?" helps if you are unsure.
3. For each lever, answer the diagnostic questions: Fully covered, Partially, Not covered, N/A.
4. Open the detailed guidance only where you have a gap.
5. Export the gap report from your track's "progress and gaps" page as Markdown or PDF.

Run it alone, or as a quarterly session with engineering and finance.

## What you get

![Example gap report for Track 1: coverage by layer, then the gaps to address with each lever, question and status](docs/assets/gap-report.png)

A dated gap report: coverage counts per layer, the gaps to address for each lever, and every answer with
your notes. Download it as Markdown, copy it to the clipboard, or print it to PDF, for a whole track or a
single layer.

## Want a prioritised plan?

The runbook is a self-service assessment: it shows where your gaps are, but it does not rank or prioritise
them. If you are an AWS customer and want a prioritised plan, share your gap report with your AWS account
team and ask for a specialist-led engagement.

## Private by design

- Runs entirely in your browser: no backend, no sign-in, no analytics and no network calls of its own
  (the build enforces this under a strict Content-Security-Policy).
- Answers and notes stay in your browser's `localStorage`. Nothing is sent anywhere.
- Reports are dated, not attributed.

## Contributing

Corrections and new evidence are welcome. Every lever in the runbook has a **Suggest a change** link that
opens a prefilled issue for that section. See [CONTRIBUTING.md](CONTRIBUTING.md) to build, verify, and open
a pull request.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This sample is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
