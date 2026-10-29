/**
 * Where am I in this runbook?
 *
 * The runbook is a 34-lever self-assessment across two tracks of three actor-layers each. Reading it
 * front to back is not how it gets used: a team picks their track and works the levers in one layer at a
 * time, over more than one sitting. Before this module the page gave them almost nothing to hold on to:
 *
 *   - The right rail was a hand-written list of eleven links spanning BOTH tracks. It never changed, so
 *     it could not say where you were, which track you were in, or how far through you had got.
 *   - Figure 2 -- the best mental model in the document, a metro map of every lever by track and layer --
 *     appeared once in the overview and then never again, exactly when it would start being useful.
 *   - A Track 1 reader carried 24 Track 2 levers in their peripheral vision the whole way down.
 *   - Coverage was revealed only at the END of a layer, so six levers were worked blind.
 *
 * So this reuses Figure 2's metaphor as a persistent instrument. The same station-on-a-spine idea renders
 * at two scales: a vertical rail map in place of the old static list, and a slim sticky stepper for widths
 * where the rail is hidden. Picking a track filters the sidebar to it and is remembered.
 *
 * Two rules it holds to
 * ---------------------
 * 1. **Nothing is discovered from a hard-coded list.** Tracks, layers and levers are read out of the DOM
 *    on load, the same contract the assessment engine and the dashboard follow: adding a lever or a layer
 *    is still an HTML-only change. That reading now lives in model.mjs, shared with the cost structure map.
 * 2. **Focus never removes content.** Filtering here applies to NAVIGATION only, and both tracks stay in the
 *    page, reachable from the tab bar, from the choice cards and from Figure 2. Panes hide a track's content
 *    from view, but never from the document -- see the docblock in tabs.mjs. Either way the content-integrity
 *    guarantee in the lever-format design notes §8 holds by construction.
 *
 * Inputs are two events, so this module reaches into nothing:
 *   `runbook:active`   from nav.mjs        -- the section the reader is looking at
 *   `runbook:coverage` from assessment.mjs -- per-layer answer counts
 *
 * ONE SIDE CARRIES THE NUMBERS, AND IT IS THIS ONE
 * ------------------------------------------------
 * The rail and the sidebar both used to state coverage: a badge on every layer link, and lever counts plus
 * `answered/total` plus a gap count on each switcher row. A reader working down a lever therefore had the
 * same three numbers in both peripheries, which is how two instruments answering one question end up
 * trusted less than one. The numbers live here and in the cost structure map; the sidebar is navigation.
 */

import { svg, el, clear } from './viz/svg.mjs';
import { buildModel, locate as locateIn } from './model.mjs';
import { scope } from './tabs.mjs';

/**
 * The sidebar shows ONE SCOPE at a time.
 *
 * It used to be two navigations stacked on top of each other: a document table of contents (Overview,
 * both tracks, Wrap-up) and a track chooser sitting above it. They undercut each other -- the chooser
 * asked you to pick a track while the tree below already listed both, so the choice read as decoration,
 * and levers sat three levels deep in a 288px rail.
 *
 * Scopes fix that by making the mode explicit. `overview` is the context mode and the default on a first
 * visit, so the foundation is never lost; a track scope is the working mode, where the LAYER becomes the
 * group title and its levers sit directly beneath, two levels instead of three. Wrap-up belongs to
 * neither track and is always shown.
 *
 * WHO OWNS SCOPE, AND WHY IT IS NO LONGER THIS MODULE. Scope is now what decides which PANE is on screen,
 * not only which sidebar tree is, so it is set before anything renders and it belongs to `tabs.mjs`. This
 * module reads it and re-renders on `runbook:scope`. Two writers of one attribute is how a pane and a
 * sidebar come to disagree about which one you are in.
 *
 * The scope SWITCHER that used to live at the top of this sidebar is gone with it. Once there is a tab bar
 * naming the five panes, a switcher naming three of them is the same duplication this sidebar was
 * redesigned to remove -- the reason its coverage counts were stripped in the first place was that two
 * instruments answering one question are trusted less than one.
 *
 * (An earlier version of this file argued against tabs on the grounds that "tabs promise mutually exclusive
 * content panes, and this is one scrolling document whose tabs would only scroll it". That objection was
 * right about tabs-as-decoration and is answered by these being real panes; the third objection it raised,
 * that hiding content breaks the focus-is-not-deletion guarantee, is answered by the hiding being CSS over a
 * DOM that still holds every section. See the docblock in tabs.mjs.)
 */
const OVERVIEW_SCOPE = 'overview';

let model = null;      // [{key, num, name, sectionId, layers:[...]}]
let coverage = {};     // scope -> {c, gaps}
let activeId = null;

/** Where a given element id sits, against the model this module loaded. See model.mjs. */
function locate(id) {
  return locateIn(model, id);
}

// ---------------------------------------------------------------------------
// Sidebar: tag the groups so CSS can filter them
// ---------------------------------------------------------------------------

/**
 * Mark each sidebar group with the track it belongs to.
 *
 * Done from JS rather than authored into the HTML so the markup carries no duplicate of the taxonomy:
 * the group titles already name their track, and that is the single source used here.
 *
 * It used to also inject a scope switcher at the top of the sidebar. The tab bar names the panes now, so a
 * switcher naming three of them would be the second instrument answering one question. See the docblock.
 */
function prepareSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Tag every group with the scope it belongs to. The group titles already name their track, so this
  // derives the mapping rather than duplicating the taxonomy in the markup.
  //
  // An AUTHORED data-nav-scope wins. Deriving from the title cannot express "this group belongs to no
  // scope and shows in all of them" -- the fallback below would file it under `wrap`, which hides in
  // Overview. The cost structure map is exactly that case, so it declares itself in the HTML.
  [...sidebar.children].forEach((node) => {
    if (!node.classList.contains('nav-group-title')) return;
    const list = node.nextElementSibling;
    const authored = node.getAttribute('data-nav-scope');
    if (authored) {
      if (list && list.tagName === 'UL' && !list.hasAttribute('data-nav-scope')) {
        list.setAttribute('data-nav-scope', authored);
      }
      return;
    }
    const text = node.textContent.trim();
    const track = model.find((t) => text.indexOf(t.num) === 0);
    // Anything that is not a track group is cross-cutting: the overview sections, and the wrap-up
    // (dashboard, checklists, references) which belong to neither track and must never be hidden.
    // Named groupScope, not scope: `scope` is the imported reader for which pane is active, and shadowing it
    // here would read as though this line were about that.
    const groupScope = track ? track.key : (/^overview$/i.test(text) ? OVERVIEW_SCOPE : 'wrap');
    node.setAttribute('data-nav-scope', groupScope);
    if (list && list.tagName === 'UL') list.setAttribute('data-nav-scope', groupScope);
  });
}

/**
 * Fill the at-a-glance map's cells with their lever count, and their coverage once the reader has begun.
 *
 * The map was a static picture of the taxonomy. It is the reader's first encounter with the 2x3 grid, so
 * saying how much work each cell actually holds belongs there -- "Agent Harness" meaning 2 levers on
 * Track 1 and 11 on Track 2 is the single most useful thing the grid can tell you, and it was silent
 * about it. Coverage is added only after something has been answered: a row of 0/12 on a first visit is
 * discouraging noise, not information.
 *
 * Values come from the same model the sidebar and the rail map read, so the three cannot disagree.
 */
function decorateMapcard() {
  if (!model) return;
  document.querySelectorAll('.mapgrid a.cell').forEach((cell) => {
    const slot = cell.querySelector('[data-cell-meta]');
    if (!slot) return;
    const id = (cell.getAttribute('href') || '').slice(1);
    let found = null;
    model.forEach((t) => t.layers.forEach((l) => { if (l.id === id) found = { track: t, layer: l }; }));
    if (!found) return;

    cell.setAttribute('data-track', found.track.key);
    clear(slot);
    const n = found.layer.levers.length;
    slot.appendChild(el('span', 'cell-n', n + (n === 1 ? ' lever' : ' levers')));

    const c = coverage[found.layer.scope];
    if (c && c.c.answered > 0) {
      slot.appendChild(el('span', 'cell-cov', c.c.answered + '/' + c.c.total));
      if (c.gaps) slot.appendChild(el('span', 'cell-gaps', c.gaps + (c.gaps === 1 ? ' gap' : ' gaps')));
    }
  });
}

/**
 * Relabel each track's own `<h2>` link in the sidebar.
 *
 * "Overview & levers" reads as a peer of the layers below it. Once the track IS the scope, what this link
 * actually offers is the track's own framing, so say that. It also fixes the breadcrumb, which takes its
 * section name from this link's text.
 *
 * This function used to also append a `answered/total` badge to every layer link. It no longer does: the
 * sidebar carries no numbers. See the module docblock.
 */
function decorateSidebarLinks() {
  if (!model) return;
  model.forEach((track) => {
    const trackLink = document.querySelector('.sidebar a.nav-link[href="#' + track.sectionId + '"]');
    if (trackLink && !trackLink.dataset.relabelled) {
      trackLink.textContent = track.num + ' overview';
      trackLink.dataset.relabelled = '1';
    }

    // The "shared" pill on a lever's nav link, DERIVED from the lever's own tag.
    //
    // It used to be authored into the sidebar by hand, next to a tag authored on the heading, and the two
    // lists drifted: they disagreed on seven levers, in both directions, and each half looked right on its
    // own in review. The heading is where the content states the claim, so it is the source; this mirrors
    // it. Idempotent, because render() runs on every scroll-spy change.
    track.layers.forEach((layer) => layer.levers.forEach((lever) => {
      const link = document.querySelector('.sidebar a.nav-link[href="#' + lever.id + '"]');
      if (!link) return;
      const has = link.querySelector('.pill-s');
      if (lever.shared && !has) {
        link.appendChild(document.createTextNode(' '));
        link.appendChild(el('span', 'pill-s', 'shared'));
      } else if (!lever.shared && has) {
        has.remove();
      }
    }));
  });
}

// ---------------------------------------------------------------------------
// Coverage ring
// ---------------------------------------------------------------------------

const RING_R = 7;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A small donut: answered share of a layer.
 *
 * `stroke-dasharray` on a circle rather than a conic-gradient, because a dash offset is a plain
 * animatable number, needs no `@property` registration, and prints.
 */
function ring(counts) {
  const pct = counts && counts.c.total ? counts.c.answered / counts.c.total : 0;
  const done = pct >= 1 && counts.c.total > 0;
  const g = svg('svg', {
    class: 'trk-ring' + (done ? ' is-done' : ''),
    viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true'
  }, [
    svg('circle', { class: 'trk-ring-track', cx: 10, cy: 10, r: RING_R }),
    svg('circle', {
      class: 'trk-ring-fill', cx: 10, cy: 10, r: RING_R,
      'stroke-dasharray': RING_C.toFixed(2),
      // Offset counts DOWN as progress goes up. transform rotates the start to 12 o'clock.
      'stroke-dashoffset': (RING_C * (1 - pct)).toFixed(2),
      transform: 'rotate(-90 10 10)'
    })
  ]);
  return g;
}

function countsLabel(counts) {
  if (!counts) return '';
  return counts.c.answered + '/' + counts.c.total;
}

// ---------------------------------------------------------------------------
// The rail map
// ---------------------------------------------------------------------------

function renderRail() {
  const mount = document.getElementById('wayfinder');
  if (!mount || !model) return;
  const fallback = document.querySelector('.rail-fallback');
  const title = document.querySelector('.rail-title');

  const here = locate(activeId);
  // Where the reader IS wins over what they focused. If you focus Track 2 but scroll into Track 1, the
  // map that shows Track 2 with no "you are here" is worse than useless -- it is confidently wrong about
  // your position. Focus governs which track the SIDEBAR lists; the map answers "where am I".
  const track = here.track || model.find((t) => t.key === scope());

  clear(mount);
  mount.hidden = false;
  if (fallback) fallback.hidden = true;

  // Outside a track (the overview, the wrap-up), the map has nothing to locate, so it steps back and
  // offers the choice instead of showing an arbitrary track.
  if (!track) {
    if (title) title.textContent = 'On this page';
    if (fallback) fallback.hidden = false;
    mount.hidden = true;
    return;
  }

  if (title) title.textContent = track.num;

  const map = el('div', 'trk-map');
  map.setAttribute('aria-label', track.num + ' progress: ' + track.layers.map((l) =>
    l.name + ' ' + countsLabel(coverage[l.scope])).join(', '));

  track.layers.forEach((layer) => {
    const isHere = here.layer && here.layer.id === layer.id;
    const counts = coverage[layer.scope];
    const gaps = counts ? counts.gaps : 0;

    const row = el('div', 'trk-stop' + (isHere ? ' is-here' : ''));
    row.setAttribute('data-layer', layer.id);

    const dot = el('span', 'trk-dot');
    dot.setAttribute('aria-hidden', 'true');
    row.appendChild(dot);

    const body = el('div', 'trk-stop-body');
    const a = el('a', 'trk-stop-name');
    a.href = '#' + layer.id;
    a.textContent = layer.name;
    body.appendChild(a);

    const meta = el('div', 'trk-stop-meta');
    meta.appendChild(ring(counts));
    meta.appendChild(el('span', 'trk-stop-n', countsLabel(counts)));
    if (gaps > 0) meta.appendChild(el('span', 'trk-stop-gaps', gaps + (gaps === 1 ? ' gap' : ' gaps')));
    body.appendChild(meta);

    // Only the layer you are in lists its levers. Listing all 24 of Agent Harness would rebuild the
    // problem the old rail had.
    if (isHere) {
      const list = el('ul', 'trk-levers');
      layer.levers.forEach((lev) => {
        const li = el('li');
        const link = el('a', 'trk-lever' + (here.lever && here.lever.id === lev.id ? ' is-here' : ''));
        link.href = '#' + lev.id;
        link.textContent = lev.text;
        link.title = lev.text;   // the CSS clamps to two lines; keep the whole name reachable
        if (here.lever && here.lever.id === lev.id) link.setAttribute('aria-current', 'true');
        li.appendChild(link);
        list.appendChild(li);
      });
      body.appendChild(list);
    }

    row.appendChild(body);
    map.appendChild(row);
  });

  mount.appendChild(map);

  // The footer that used to sit here offered two ways out of the layer: "Your assessment at a glance" and the
  // lever board. Both moved into the Assessment pane, which made this rail -- titled "On this page" -- offer two
  // links that were not on this page. A navigation surface that teleports the reader out of the surface they
  // are reading is a trapdoor, not a shortcut, and the tab bar already names that pane one click away.
  //
  // So the rail lists the track's own layers and nothing else. A DOM check asserts no link in the sidebar OR
  // the rail leaves the active pane, in every pane.
}

// ---------------------------------------------------------------------------
// The sticky stepper (narrow widths, where the rail is not rendered)
// ---------------------------------------------------------------------------

function renderStepper() {
  const mount = document.getElementById('trackStepper');
  if (!mount || !model) return;

  const here = locate(activeId);
  const track = here.track || model.find((t) => t.key === scope());   // see renderRail

  clear(mount);
  if (!track) { mount.hidden = true; return; }
  mount.hidden = false;

  const num = el('span', 'stp-track', track.num);
  mount.appendChild(num);
  const currentIndex = here.layer ? track.layers.indexOf(here.layer) : -1;
  const status = currentIndex >= 0
    ? 'Step ' + (currentIndex + 1) + ' of ' + track.layers.length + ': ' + here.layer.name
    : 'Assessment overview · choose 1 of ' + track.layers.length + ' layers';
  mount.appendChild(el('span', 'stp-status', status));

  const steps = el('div', 'stp-steps');
  track.layers.forEach((layer) => {
    const isHere = here.layer && here.layer.id === layer.id;
    const counts = coverage[layer.scope];
    const a = el('a', 'stp-step' + (isHere ? ' is-here' : ''));
    a.href = '#' + layer.id;
    a.appendChild(el('span', 'stp-dot'));
    a.appendChild(el('span', 'stp-name', layer.name));
    a.appendChild(el('span', 'stp-n', countsLabel(counts)));
    if (isHere) a.setAttribute('aria-current', 'true');
    steps.appendChild(a);
  });
  mount.appendChild(steps);
}

// ---------------------------------------------------------------------------
// Scroll-linked spine progress
// ---------------------------------------------------------------------------
// How far through the current layer the reader is, as a 0..1 custom property the CSS draws with.
//
// Deliberately computed here rather than with `animation-timeline: view()`. The native scroll-driven
// primitive animates an element against ITS OWN position in a scroller; here the animated element (a
// spine in the fixed rail) and the driver (a layer far down the document) are different elements, which
// needs `timeline-scope` and is Chrome-only. One rAF-throttled write of a custom property does the same
// job, works everywhere, and is trivially disabled for reduced motion.

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let rafPending = false;
function updateProgress() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const here = locate(activeId);
    if (!here.layer) return;
    const start = document.getElementById(here.layer.id);
    if (!start) return;

    // The layer runs from its heading to the next layer heading, or to the end of its track section.
    const track = here.track;
    const idx = track.layers.indexOf(here.layer);
    const nextLayer = track.layers[idx + 1];
    const endEl = nextLayer ? document.getElementById(nextLayer.id) : document.getElementById(track.sectionId);
    const top = start.getBoundingClientRect().top;
    const end = endEl ? (nextLayer ? endEl.getBoundingClientRect().top : endEl.getBoundingClientRect().bottom) : top;
    const span = Math.max(1, end - top);
    const p = Math.min(1, Math.max(0, (0 - top) / span));

    const row = document.querySelector('.trk-stop.is-here');
    if (row) row.style.setProperty('--trk-progress', p.toFixed(4));
    const step = document.querySelector('.stp-step.is-here');
    if (step) step.style.setProperty('--trk-progress', p.toFixed(4));
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function render() {
  decorateSidebarLinks();
  decorateMapcard();
  renderRail();
  renderStepper();
  updateProgress();
}

export function initWayfinder() {
  model = buildModel();
  if (!model.length) return;   // not the runbook; leave the static rail alone

  prepareSidebar();

  // Scope is already set by initTabs(), which runs first precisely because it decides which pane is on
  // screen. This module only reads it, and re-renders when it changes.
  document.addEventListener('runbook:scope', render);

  document.addEventListener('runbook:active', (e) => {
    activeId = e.detail && e.detail.id;
    // Focus is ONLY ever set by the reader, through a choice card or the switcher. An earlier version
    // adopted whichever track you happened to scroll into, which meant "Show both" was undone by the very
    // next scroll event: you clicked it, the sidebar re-filtered, and nothing explained why. The map
    // already follows your position, so inferring focus buys nothing and costs control.
    render();
  });

  document.addEventListener('runbook:coverage', (e) => {
    coverage = (e.detail && e.detail.byScope) || {};
    // The switcher no longer shows counts, so coverage cannot change it. Skipping it here also means
    // answering a question can no longer rebuild the buttons under the reader's cursor.
    decorateMapcard();
    renderRail();
    renderStepper();
  });

  // The choice cards in "Which track am I in?" need no handler here any more. They are real anchors pointing
  // into their track's first layer, and tabs.mjs resolves any in-page anchor to the pane that owns it, so
  // clicking a card switches pane through the same one mechanism every other cross-pane link uses. A second
  // handler calling setScope() with the card's own `data-choose-track` would be a parallel route to the same
  // state, and the two would disagree the moment a card's href changed.
  if (!prefersReducedMotion()) {
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
  }

  render();
}
