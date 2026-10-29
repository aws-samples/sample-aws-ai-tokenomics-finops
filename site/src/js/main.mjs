/**
 * Bundle entry for the runbook's behaviour.
 *
 * The runbook used to carry one ~690-line inline script block containing a single outer IIFE with two
 * nested IIFEs inside it. This file replaces that outer IIFE: each former section is now a module
 * exporting one init function, and they are called here in exactly the order the original code ran
 * them. That ordering is the contract — the modules were extracted as contiguous slices of the
 * original and none of them reads another's variables, but they do assume the DOM is present, and
 * `initHashDetails` must run after `buildCostMap` because a hash can point inside a collapse
 * the explorer has just rendered.
 *
 * There is no DOMContentLoaded wrapper, deliberately: the generated script block sits at the end of
 * <body>, so the document is already parsed. Keep it that way.
 */

import { initTheme } from './theme.mjs';
import { initNav } from './nav.mjs';
import { initTabs } from './tabs.mjs';
import { initTrackExperience } from './track-experience.mjs';
import { buildLeverSheet } from './levers-sheet.mjs';
import { buildHeatmap } from './heatmap.mjs';
import { buildCostMap } from './costmap.mjs';
import { initHashDetails } from './hash.mjs';
import { initScope } from './scope.mjs';
import { assessment } from './assessment.mjs';
import { initWayfinder } from './wayfinder.mjs';
import { initSuggestLinks } from './suggest.mjs';

initTheme();
initNav();
initTrackExperience();

// Before anything that measures or builds, and for two reasons. (1) It sets `data-scope`, which decides which
// pane is on screen; setting it later would show the whole document for a frame and then collapse it. (2) It
// publishes `--sticky-1`, the offset the breadcrumb and the cost map's command bar pin against, so both
// measure against a bar that is already there.
//
// After initNav, because it reads buildModel() for the track tabs and headingText() is only stable once the
// heading anchors have been appended -- the same dependency buildCostMap() has below.
initTabs();

// The TLDR pane. Both read the document rather than holding any content of their own: the sheet takes each
// lever's `.saves-head`, the mapcard's per-layer hints and the choice cards' economics lines; the heatmap
// takes `data-effort`/`data-impact` off the lever headings. The heatmap imports the sheet's parser, so there
// is one pass over the headlines and not two answers to what a lever saves.
buildLeverSheet();
buildHeatmap();

// After initNav (which appends a heading anchor to every heading the map reads the text of) and before
// initHashDetails (a hash can point inside a collapse the map has just rendered). It subscribes to
// `runbook:coverage`, which assessment() fires on init below.
buildCostMap();
initHashDetails();
// Before assessment(): it marks excluded levers' `.assess` blocks `data-scope-out`, which assessment()
// reads on its first count. The reverse order would show the full totals for a frame and then recount.
initScope();
assessment();

// The wayfinder listens for nav's `runbook:active` and assessment's `runbook:coverage`, so it must be
// initialised after both -- otherwise it misses the first render and shows an empty map until the
// reader scrolls.
initWayfinder();

// Last: purely additive, and it must never be able to stop the runbook itself from working. It puts a
// "Suggest a change" link after every h4 heading, so it runs after initNav() has appended the heading
// anchors that headingText() skips, and after everything that reads the document's structure. It makes
// no request: it only builds links to the repository's GitHub issue form.
try {
  initSuggestLinks();
} catch (e) {
  // A broken link bar must not take the page down with it. Silent by design: verify asserts zero
  // console errors, and a missing link is visible to anyone reading the page.
}
