# Maintainer guide

This page is for the AI Tokenomics FinOps maintainers and working group. It records how issues are triaged and the repository settings to apply at go-live. Contributors should read [CONTRIBUTING.md](../CONTRIBUTING.md) instead.

## Triage

New issues arrive from the issue forms with a type label (`content`, `pricing`, `new-lever`, or `bug`) and `needs-triage`.

1. Confirm the issue is in scope and not a duplicate. Close duplicates with a link to the original.
2. Check that the cited source is public and supports the change. If it is missing or not public, add `needs-source` and ask for one.
3. Add a track label (`track:coding-agent` or `track:agentic-app`) where it applies.
4. Add `good first issue` or `help wanted` if the community could pick it up.
5. Remove `needs-triage`.

Never paste customer, internal, or confidential information into an issue, a pull request, or a review comment, including when you explain why a change was declined.

## Labels

The label set is documented in [.github/labels.yml](../.github/labels.yml). It is not synced automatically. To add or change a label, update that file in a pull request and then apply the change on the repository, either in **Issues > Labels** or with the REST API ([create a label](https://docs.github.com/en/rest/issues/labels#create-a-label), [update a label](https://docs.github.com/en/rest/issues/labels#update-a-label)). The repo-hygiene workflow fails if an issue form applies a label that is missing from `labels.yml`.

## Go-live settings

These settings are intentionally not applied yet. Apply them when the repository is made public.

### Discussions

Enable Discussions in **Settings > General > Features**, then set up these categories in **Discussions > Categories**:

| Category | Format | Purpose |
|---|---|---|
| Announcements | Announcement (maintainers post) | Releases and notable runbook updates |
| Q&A | Question and answer | Questions about applying a lever, with an accepted answer |
| Ideas | Open-ended discussion | Early lever ideas before a formal proposal |
| Show and tell | Open-ended discussion | How readers applied the runbook and what they saved (public figures only) |
| General | Open-ended discussion | Anything else |

The issue template chooser already links to Discussions through `.github/ISSUE_TEMPLATE/config.yml`, so the link starts working as soon as Discussions is enabled. See [GitHub Discussions documentation](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions).

### Ruleset for `main`

Create a branch ruleset in **Settings > Rules > Rulesets** that targets the default branch, with enforcement status **Active**:

- **Restrict deletions:** on.
- **Block force pushes:** on.
- **Require a pull request before merging:** on.
  - Required approvals: 1.
  - Require review from Code Owners: on.
  - Dismiss stale pull request approvals when new commits are pushed: on.
  - Require conversation resolution before merging: on.
- **Require status checks to pass:** on, with these required checks:
  - the CI workflow's build and verify job (`.github/workflows/ci.yml`),
  - `repo-hygiene` (`.github/workflows/repo-hygiene.yml`).
  - Require branches to be up to date before merging: on.
- **Bypass list:** leave empty, or add only the repository admin role for emergencies. External contributors never get bypass.

Select the required checks by name after each workflow has run at least once, so GitHub offers them in the picker. See [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) and [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

### Post go-live checks

Issue forms and `config.yml` only take effect on the default branch, so run these checks after this kit is merged to `main`:

1. Open **Issues > New issue** and confirm the chooser lists the four forms, a Discussions link, and the security link, and offers no blank issue to non-maintainers.
2. Open `https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=content-correction.yml&section=Test%20Section` and confirm the **Section** field reads "Test Section".
3. Confirm **Settings > Code owners** (or the CODEOWNERS file view) reports no errors.
