# Presenter deck: Tokenomics for AI Workloads

A 26-slide talk track for the runbook (plus one drill-down slide), by Traci Lim. Use it to present AI
tokenomics to engineering, platform and finance audiences.

**[Open the deck](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/deck/)**

The deck follows the runbook: why AI spend grows, the AI FinOps flywheel, the two tracks and their levers,
two illustrative worked examples, and how to run the self-assessment. It ends on the same call to action as
the runbook: the runbook is a self-service assessment and does not rank your gaps; for a prioritised plan,
AWS customers can share their gap report with their AWS account team and ask for a specialist-led
engagement.

> Sample guidance published as-is under the MIT-0 licence. It is not official AWS documentation and is not
> supported by AWS. Prices and service features change; confirm figures against the linked AWS pages before
> relying on them. Dollar figures are illustrative unless dated and cited.

## Present it

1. Open the [hosted deck](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/deck/), or
   download [`tokenomics-for-ai-workloads.bento.html`](tokenomics-for-ai-workloads.bento.html)
   (**Download raw file**) and open it from disk. It works offline: one file, nothing to install.
2. Press **F5** (or *Present*) to start the show. Arrow keys step through slides and their builds.
3. Speaker notes are on every slide; open the speaker view from the show's menu.

Slide 17 ("Illustrative: 500 developers") has a button to a sensitivity table; click anywhere on that table
to return.

## Edit it

The file is a [Bento](https://bento.page) deck (`.bento.html`): the document is plain JSON in one
`<script type="application/bento+json" id="bento-doc">` block, and the rest of the file is Bento's
compressed viewer and editor.

- **In the editor.** Open the file in a browser, edit on the canvas, then save. Save writes a new copy of
  the file; replace `deck/tokenomics-for-ai-workloads.bento.html` with it.
- **As JSON.** Edit only the `#bento-doc` block, in place, and escape every `<` as `\u003c`. Leave the
  rest of the file untouched. The Bento agent guide and schema are at
  [bento.page/agents.md](https://bento.page/agents.md).
- **Before you commit**, if the editor saved live-session keys into the file (it does so once you use
  *Share*), save a share copy instead: `npm run verify:deck` fails on them.

The published page is built by `npm run build`: `scripts/build-site.mjs` copies this file to
`dist/deck/index.html` and adds one Content-Security-Policy `<meta>`. The source file never carries a CSP of
its own.

## Public-safety rule

This deck is public. Everything in it, including speaker notes, alt text, hidden content and image assets,
must be safe for any audience:

- no internal-only material, internal systems, links, aliases, channels or program names;
- no customer names, logos, account IDs or figures that identify a customer;
- no non-public, negotiated or forward-looking pricing or roadmap statements;
- no third-party screenshots, logos or press headlines: paraphrase and cite the public source instead;
- every price or figure matches the runbook and its public source.

Remove material rather than hide it. `npm run verify:deck` (part of `npm run verify` and CI) decodes the
document and fails on internal markers and hosts, account-like numbers, alias handles, live-session keys,
hidden slides, any remote image or media source, broken slide links, and slide-count drift. It then opens
the published copy in headless Chrome under its CSP, steps through every slide, and fails on any request to
another origin, any page error, any unexpected CSP refusal, or any error or structural warning from Bento's
own `validate()`. Text overflow is reported but not failed: the deck uses the system-ui font stack, so line
breaks depend on the machine's fonts. Check long titles on the platform you present from. If you add or remove slides on purpose, update the pinned counts in `scripts/verify-deck.mjs`
in the same pull request.

## Security

The deck page runs under its own policy, separate from the runbook's:

```
default-src 'none'; script-src 'sha256-<loader>' blob:; style-src 'unsafe-inline';
img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none';
worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Scripts are pinned to the hash of Bento's one inline loader, plus `blob:` for the runtime it unpacks. The
network is closed: Bento's launch-time update check to bento.page is refused in the browser, so the page
makes no request at all. Inline styles are allowed because the runtime renders slides with them.

## Licence and credits

Deck by Traci Lim, contributed under the repository's [MIT-0 licence](../LICENSE). The file embeds the
Bento runtime (MIT, © 2026 The Bento authors) and its bundled components (reveal.js, Moveable and Selecto,
MIT). Their licence notices are in the `NOTICE` comment at the top of the file and must stay there.
Size: about 3.3 MB, mostly the embedded runtime and the runbook demo animation.
