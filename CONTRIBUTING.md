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

The [README](README.md) describes where the runbook content lives, how to install dependencies, how to preview the site, and how to build it. Please follow it rather than a copy here, so the commands stay in one place.

Before you open a pull request, run `npm run verify` and make sure it passes. The same checks run in CI on every pull request, and a pull request cannot be merged until they are green.

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
