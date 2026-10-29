/**
 * Figure 2, the cost structure map: every lever, where it sits, and how far you have got with it.
 *
 * What this replaced, and why
 * ---------------------------
 * Three static columns (Track 1 | shared | Track 2) listing 34 levers as chips. It was a good picture of
 * the taxonomy and a poor instrument, because it knew nothing about the reader: not where they were, not
 * what they had answered, not which lever they had written a note against. A reader who came back to it
 * mid-assessment got the same view as on their first visit, so there was no reason to come back.
 *
 * It is now the runbook's navigation destination: a status board of six cells (two tracks by three
 * actor-layers) whose lever rows carry live state, over a command bar that can narrow 34 levers to the
 * seven with a gap. "Where do I go next" is answerable here in one click, which is the thing the sidebar
 * and the right rail cannot do -- the rail only ever shows the three layers of the track you are in.
 *
 * Four rules it holds to
 * ----------------------
 * 1. **The taxonomy comes from the document.** Tracks, layers and levers are read via model.mjs, the same
 *    model the sidebar and the right rail use, so the three cannot disagree and adding a lever stays an
 *    HTML-only change.
 * 2. **State comes from one owner.** Per-lever counts arrive on `runbook:coverage` from assessment.mjs.
 *    This module never touches `localStorage` and holds no copy of the answers.
 * 3. **Filtering is navigation, never deletion.** A filter marks rows out of view; it never removes them
 *    from the DOM, and the lever-index table below stays complete. That is the content-integrity guarantee
 *    in the lever-format design notes §8, kept by construction.
 * 4. **Status is never carried by colour alone.** Each state has its own silhouette as well as its own
 *    hue, plus a visible `answered/total` and a legend. The palette is the already-validated coverage
 *    palette from 90-assess.css; see the note there for the measurements.
 *
 * The cross-track connector survives from the old figure: hovering a shared lever draws a dashed bezier to
 * its counterpart on the other track rather than only recolouring it, because two lit chips in a six-cell
 * board asks the reader to infer the relationship. On a board the twin is usually directly below rather
 * than across, which the curve handles the same way. Three things it has to survive, each of which it did
 * not once: a counterpart named by an anchor deeper than a lever heading (resolved through
 * `leverIdOwning()`), a lever with more than one counterpart (one curve each, not just the first), and a
 * counterpart the filter has taken out of view (skipped, because a `display: none` row measures as zero and
 * the curve would leave the board).
 */

import { svg, el, clear } from './viz/svg.mjs';
import { buildModel, locate, leverIdOwning } from './model.mjs';

/* --------------------------------------------------------------------------------------------------
 * Static relations that are not derivable from the headings
 * ------------------------------------------------------------------------------------------------ */
// Which topics are treated on both tracks, and the three principles that are treated once. These pair up
// two levers that share nothing structurally -- no heading, no id, no attribute says they are the same
// topic -- so the pairing has to be stated somewhere. Kept here, verbatim from the previous explorer, and
// cross-checked against the lever-index table's "Second treatment" column at build time below.
//
// An end may be a DEEPER anchor than a lever heading. Track 1 treats the legacy-model audit as Q4 of
// "Right-size the model to the task" rather than as a lever, and `#manage-the-model-lifecycle` is the id on
// that question. Both ends are therefore resolved through `leverIdOwning()` before anything on the board is
// drawn from them, and the original anchor is kept so the jump still lands on the treatment itself. Two
// consequences worth knowing: a lever can have MORE than one counterpart (right-sizing pairs with cost-aware
// routing on its own account and with the legacy audit through this resolution), and the two ends of a pair
// need not sit in the same actor-layer, because the layer records who holds the control on that track.

const SHARED_TOPICS = [
  { name: 'Model right-sizing and routing', t1: '#right-size-the-model-to-the-task', t2: '#decision-guidance-cost-aware-model-routing' },
  { name: 'Legacy / extended-access model audit', t1: '#manage-the-model-lifecycle', t2: '#audit-for-legacy--extended-access-models' },
  { name: 'Context hygiene', t1: '#manage-the-session-and-its-context-actively', t2: '#trim-what-the-harness-injects' },
  { name: 'Tool and plugin surface', t1: '#manage-organisational-plugins', t2: '#budget-the-tool-definition-weight' }
];

/**
 * The filters, in the order they appear. `test` takes a lever's counts (or null when the reader has not
 * answered anything against it) and says whether the lever belongs in this view.
 *
 * "Gaps" is first after All deliberately: it is the reason a reader comes back to this map.
 */
const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'gap', label: 'Gaps', test: (c) => !!c && c.gaps > 0 },
  { key: 'notes', label: 'Notes', test: (c) => !!c && c.notes > 0 },
  // "Not started" means there IS something to start. One lever carries no assessment at all (it is prose
  // that hands off to the next lever), and counting it here would put a number on the chip that a reader
  // could never work down to zero.
  { key: 'open', label: 'Not started', test: (c) => !!c && c.total > 0 && c.answered === 0 },
  { key: 'progress', label: 'In progress', test: (c) => !!c && c.answered > 0 && c.answered < c.total },
  { key: 'done', label: 'Complete', test: (c) => !!c && c.total > 0 && c.answered === c.total }
];

/**
 * A lever's state, as one word.
 *
 * Order matters: a gap outranks progress, because a lever you have half-answered and found a hole in is a
 * gap first. `na` only applies when every answer was N/A -- one N/A among four covered answers is not an
 * N/A lever.
 *
 * `none` is a lever with no assessment block. Distinguishing it from `open` matters: a blank where the
 * `answered/total` should be reads as a rendering fault, and treating it as "not started" would promise the
 * reader questions that are not there.
 */
function stateOf(c) {
  if (!c || !c.total) return 'none';
  if (c.answered === 0) return 'open';
  if (c.gaps > 0) return 'gap';
  if (c.answered < c.total) return 'progress';
  if (c.na === c.total) return 'na';
  return 'done';
}

const STATE_LABEL = {
  none: 'No assessment questions',
  open: 'Not started',
  progress: 'In progress',
  gap: 'Gap to close',
  done: 'Fully covered',
  na: 'Not applicable'
};

/**
 * What a lever with no questions says about itself.
 *
 * A lever can legitimately have no assessment: a pure cross-reference lever is prose that points at its
 * treatment elsewhere (the lever-format design notes §3). But an assessment someone forgot to
 * author looks exactly the same from here. So the row states only what the lever DECLARES: a declared
 * cross-reference reads "reference", and anything else reads "no questions", which is a description rather
 * than a claim about intent. `npm run verify` fails on the second case, so it should never reach a reader.
 */
function noneWording(lever) {
  return lever && lever.kind === 'cross-reference'
    ? { word: 'reference', label: 'Cross-reference lever — no assessment of its own' }
    : { word: 'no questions', label: STATE_LABEL.none };
}

/**
 * The status marker: a silhouette per state, not a dot per colour.
 *
 * A ring, a half-filled ring, a triangle and a ticked disc are four different shapes at 14px, in
 * greyscale, and under forced-colors -- which is what makes the hue the second channel rather than the
 * only one. Geometry is SVG attributes, so nothing here needs an inline style.
 */
function marker(state) {
  const attrs = { class: 'csm-mark csm-mark-' + state, viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' };
  if (state === 'gap') {
    // A triangle is the one silhouette that reads as "attention" without a colour.
    return svg('svg', attrs, [
      svg('path', { class: 'csm-mark-body', d: 'M8 1.6 L15 14 L1 14 Z' }),
      svg('path', { class: 'csm-mark-ink', d: 'M8 6.1 V9.6' }),
      svg('circle', { class: 'csm-mark-dot', cx: 8, cy: 11.6, r: 0.95 })
    ]);
  }
  if (state === 'done') {
    return svg('svg', attrs, [
      svg('circle', { class: 'csm-mark-body', cx: 8, cy: 8, r: 6.6 }),
      svg('path', { class: 'csm-mark-ink', d: 'M4.8 8.3 L7 10.5 L11.2 5.9' })
    ]);
  }
  if (state === 'progress') {
    // Half-filled: the same disc as "done", so progress towards it is legible as partial completion.
    return svg('svg', attrs, [
      svg('circle', { class: 'csm-mark-ring', cx: 8, cy: 8, r: 6.6 }),
      svg('path', { class: 'csm-mark-body', d: 'M8 1.4 A6.6 6.6 0 0 1 8 14.6 Z' })
    ]);
  }
  if (state === 'na') {
    return svg('svg', attrs, [
      svg('circle', { class: 'csm-mark-ring', cx: 8, cy: 8, r: 6.6 }),
      svg('path', { class: 'csm-mark-ink', d: 'M4.9 8 H11.1' })
    ]);
  }
  if (state === 'none') {
    // No assessment to be in a state about. A bare centre dot, so the row still has an aligned marker
    // column but claims no progress in either direction.
    return svg('svg', attrs, [svg('circle', { class: 'csm-mark-body', cx: 8, cy: 8, r: 1.9 })]);
  }
  // open: a hollow dashed ring. Nothing has been said about this lever yet, so it carries no status hue.
  return svg('svg', attrs, [svg('circle', { class: 'csm-mark-ring is-open', cx: 8, cy: 8, r: 6.6 })]);
}

/* --------------------------------------------------------------------------------------------------
 * The donut, shared with the right rail's stops
 * ------------------------------------------------------------------------------------------------ */

const RING_R = 7;
const RING_C = 2 * Math.PI * RING_R;

function ring(counts) {
  const pct = counts && counts.total ? counts.answered / counts.total : 0;
  const done = pct >= 1 && counts.total > 0;
  return svg('svg', {
    class: 'trk-ring' + (done ? ' is-done' : ''),
    viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true'
  }, [
    svg('circle', { class: 'trk-ring-track', cx: 10, cy: 10, r: RING_R }),
    svg('circle', {
      class: 'trk-ring-fill', cx: 10, cy: 10, r: RING_R,
      'stroke-dasharray': RING_C.toFixed(2),
      'stroke-dashoffset': (RING_C * (1 - pct)).toFixed(2),
      transform: 'rotate(-90 10 10)'
    })
  ]);
}

/* --------------------------------------------------------------------------------------------------
 * Module state
 * ------------------------------------------------------------------------------------------------ */

let model = null;
let byLever = {};              // lever heading id -> counts, from runbook:coverage
let activeId = null;           // the lever the reader is looking at, from runbook:active
let filterKey = 'all';
let query = '';
// '#lever href' -> [{ href, anchor, topic }] counterparts on the other track. `href` is the LEVER the board
// can draw to; `anchor` is what SHARED_TOPICS actually named, which may be a question inside that lever and
// is what a jump should use. A list rather than a single value because one lever has two counterparts.
let twinsOf = {};

const rows = [];               // { id, href, text, lever, twins, node, li, markSlot, countSlot, noteSlot, layer, track }
const cells = [];              // { layer, track, node, list, ringSlot, countSlot, gapSlot, emptyNode, rows[] }
let heroNodes = null;
let bannerMeta = {};           // track key -> the slot on that track's banner
let barNodes = null;
let linkOverlay = null;
let linkPaths = [];            // reused <path class="te-link"> nodes, one per curve currently drawn
let board = null;

/* --------------------------------------------------------------------------------------------------
 * Reading the page
 * ------------------------------------------------------------------------------------------------ */

/** The href of the lever that owns an anchor, or '' when the anchor is not in a track. */
function leverHrefFor(href) {
  const id = leverIdOwning(model, (href || '').replace(/^#/, ''));
  return id ? '#' + id : '';
}

/**
 * Resolve SHARED_TOPICS into the board's own terms: lever href -> the counterparts it can draw to.
 *
 * An end that resolves to nothing is dropped rather than half-registered, because a `data-twin` naming a row
 * that does not exist is exactly the fault this replaced: the badge promised "hover to see where" and the
 * connector silently drew nothing. `npm run verify` now fails on it rather than leaving it to be noticed.
 */
function buildTwins() {
  const out = {};
  const add = (from, to, anchor, topic) => {
    if (!from || !to || from === to) return;
    const list = out[from] || (out[from] = []);
    if (!list.some((t) => t.href === to)) list.push({ href: to, anchor: anchor, topic: topic });
  };
  SHARED_TOPICS.forEach((t) => {
    const a = leverHrefFor(t.t1);
    const b = leverHrefFor(t.t2);
    add(a, b, t.t2, t.name);
    add(b, a, t.t1, t.name);
  });
  return out;
}

/**
 * Where a counterpart lives, as words: "Track 2, Agent Harness: Trim what the harness injects".
 *
 * The track number, the layer name and the lever name all come off the model, so the tooltip cannot drift
 * from the headings. It names the LAYER as well as the track deliberately: a shared topic can sit in a
 * different actor-layer on each track, and without the layer stated that reads as a filing mistake rather
 * than as the point, which is that the layer records who holds the control on that track.
 *
 * Where the counterpart is a question inside that lever rather than the lever itself, it says so, for the
 * same reason the shared band words its jump "Track 1 note →": naming the lever alone would promise a whole
 * lever's worth of treatment and hand the reader one question.
 */
function describeTwin(twin) {
  const at = locate(model, (twin.href || '').replace(/^#/, ''));
  if (!at.lever) return twin.topic || 'the other track';
  const where = [at.track && at.track.num, at.layer && at.layer.name].filter(Boolean).join(', ');
  const inside = twin.anchor && twin.anchor !== twin.href ? ' (inside that lever)' : '';
  return (where ? where + ': ' + at.lever.text : at.lever.text) + inside;
}

/** Sum a set of levers' counts into one record. */
function totalsOf(levers) {
  const t = { total: 0, answered: 0, yes: 0, wip: 0, no: 0, na: 0, gaps: 0, notes: 0, noted: 0 };
  levers.forEach((lev) => {
    const c = byLever[lev.id];
    if (!c) return;
    ['total', 'answered', 'yes', 'wip', 'no', 'na', 'gaps', 'notes'].forEach((k) => { t[k] += c[k]; });
    if (c.notes > 0) t.noted++;
  });
  return t;
}

function trackLevers(track) {
  return track.layers.reduce((acc, l) => acc.concat(l.levers), []);
}

function allLevers() {
  return model.reduce((acc, t) => acc.concat(trackLevers(t)), []);
}

/* --------------------------------------------------------------------------------------------------
 * Build: the hero
 * ------------------------------------------------------------------------------------------------ */

/**
 * The headline: how big this is, and how far in you are.
 *
 * The per-track chips are here because the sidebar no longer carries them. That is a better home for the
 * claim they were making -- a reader can see the other track's progress AND the gaps behind it AND jump
 * into it, none of which a `3/30` in a nav row could offer.
 */
function buildHero() {
  const hero = el('div', 'csm-hero');

  const head = el('div', 'csm-hero-head');
  const titles = el('div', 'csm-hero-titles');
  titles.appendChild(el('span', 'csm-hero-eyebrow', 'Cost structure'));
  titles.appendChild(el('h3', 'csm-hero-h', 'Every lever, and where you are with it'));
  head.appendChild(titles);

  const stats = el('div', 'csm-stats');
  const mk = (cls, label) => {
    const box = el('div', 'csm-stat' + (cls ? ' ' + cls : ''));
    const n = el('span', 'csm-stat-n', '—');
    box.appendChild(n);
    box.appendChild(el('span', 'csm-stat-l', label));
    return { box, n };
  };
  const levers = mk('', 'levers');
  const answered = mk('', 'questions answered');
  const gaps = mk('is-gap', 'gaps to close');
  const noted = mk('', 'levers with notes');
  [levers, answered, gaps, noted].forEach((s) => stats.appendChild(s.box));
  head.appendChild(stats);
  hero.appendChild(head);

  heroNodes = { levers: levers.n, answered: answered.n, gaps: gaps.n, gapBox: gaps.box, noted: noted.n };
  return hero;
}

/* --------------------------------------------------------------------------------------------------
 * Build: the command bar
 * ------------------------------------------------------------------------------------------------ */

function buildBar() {
  const bar = el('div', 'csm-bar');
  bar.id = 'costMapBar';

  const search = el('div', 'csm-search');
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'csm-search-in';
  input.id = 'costMapSearch';
  input.placeholder = 'Find a lever…';
  input.setAttribute('aria-label', 'Find a lever by name');
  search.appendChild(input);
  bar.appendChild(search);

  const chips = el('div', 'csm-filters');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Show only levers in this state');
  const chipNodes = {};
  FILTERS.forEach((f) => {
    const b = el('button', 'csm-filter csm-filter-' + f.key);
    b.type = 'button';
    b.setAttribute('data-filter', f.key);
    b.appendChild(el('span', 'csm-filter-l', f.label));
    const n = el('span', 'csm-filter-n');
    b.appendChild(n);
    b.addEventListener('click', () => {
      // Clicking the active filter clears it. Otherwise "Gaps" is a one-way door for anyone who does not
      // spot the All chip, and Clear is the only way back.
      filterKey = filterKey === f.key ? 'all' : f.key;
      applyFilter();
    });
    chips.appendChild(b);
    chipNodes[f.key] = { button: b, n };
  });
  bar.appendChild(chips);

  const tail = el('div', 'csm-bar-tail');
  const count = el('span', 'csm-showing');
  count.setAttribute('aria-live', 'polite');
  tail.appendChild(count);
  const clear_ = el('button', 'csm-clear', 'Clear');
  clear_.type = 'button';
  clear_.hidden = true;
  clear_.addEventListener('click', () => {
    filterKey = 'all';
    query = '';
    input.value = '';
    applyFilter();
    input.focus();
  });
  tail.appendChild(clear_);
  bar.appendChild(tail);

  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    applyFilter();
  });

  barNodes = { chips: chipNodes, showing: count, clear: clear_, input: input };
  return bar;
}

/* --------------------------------------------------------------------------------------------------
 * Build: the board
 * ------------------------------------------------------------------------------------------------ */

/** The column glyphs, cloned from the at-a-glance map so the two surfaces name a layer the same way. */
function layerGlyph(index) {
  const source = document.querySelectorAll('.mapgrid .col-h svg.col-glyph')[index];
  if (!source) return null;
  const copy = source.cloneNode(true);
  copy.setAttribute('class', 'csm-colglyph');
  return copy;
}

function buildLeverRow(lever, layer, track) {
  const href = '#' + lever.id;
  const a = el('a', 'te-chip csm-lever');
  a.href = href;
  a.setAttribute('data-lever-id', lever.id);

  const markSlot = el('span', 'csm-markslot');
  a.appendChild(markSlot);

  const body = el('span', 'csm-lever-body');
  body.appendChild(el('span', 'te-chiptext', lever.text));
  const meta = el('span', 'csm-lever-meta');
  body.appendChild(meta);
  a.appendChild(body);

  // The badge says what the lever's own `shared` pill says -- the content owns that claim. The connector
  // needs more than the claim: it needs to know WHICH lever on the other track, which only SHARED_TOPICS
  // states, so `data-twin` is set separately. They agree for all nine shared levers today, and a DOM check
  // asserts they still do, because a new pill without a matching pair would give a reader a badge whose
  // hover does nothing.
  //
  // `data-twin` is a space-separated list, because one lever has two counterparts. The title names each
  // counterpart's track AND layer rather than saying "the other track": the pair can cross layers, and the
  // reader deserves to be told where it went instead of being left to find it.
  const twins = twinsOf[href] || [];
  if (lever.shared || twins.length) {
    a.classList.add('shared');
    const badge = el('span', 'te-badge', '⇄ shared');
    if (twins.length) {
      a.setAttribute('data-twin', twins.map((t) => t.href).join(' '));
      badge.title = 'Also treated on ' + twins.map(describeTwin).join('; ') + ' — hover to see where';
    } else {
      badge.title = 'Also treated on the other track';
    }
    meta.appendChild(badge);
  }
  const countSlot = el('span', 'csm-lever-n');
  meta.appendChild(countSlot);
  const noteSlot = el('span', 'csm-lever-note');
  noteSlot.hidden = true;
  meta.appendChild(noteSlot);

  const jump = el('span', 'te-jump', '→');
  jump.setAttribute('aria-hidden', 'true');
  a.appendChild(jump);

  const li = el('li');
  li.appendChild(a);

  // One chip per counterpart, naming it and linking to it.
  //
  // The curve cannot carry this alone: measured, every pair on this board is 820 to 1090px apart, so at any
  // realistic viewport the counterpart is off screen and the line points at something the reader cannot see.
  // The chip is the answer to "linked to what, and where is it" without scrolling to find out. It links to
  // the AUTHORED anchor, not the resolved lever, so the legacy-audit pair still lands on the Q4 that carries
  // the treatment rather than the top of the lever that contains it.
  if (twins.length) {
    const box = el('div', 'csm-twins');
    twins.forEach((t) => {
      const at = locate(model, (t.href || '').replace(/^#/, ''));
      const link = el('a', 'csm-twin');
      link.href = t.anchor || t.href;
      // Track 1 precedes Track 2 in the document and on the board, so comparing the keys gives the direction
      // the reader will actually travel.
      const up = !!(at.track && track && at.track.key < track.key);
      link.appendChild(el('span', 'csm-twin-dir', up ? '↑' : '↓'));
      link.appendChild(el('span', 'csm-twin-text', describeTwin(t)));
      box.appendChild(link);
    });
    li.appendChild(box);
  }

  const row = { id: lever.id, href: href, text: lever.text, lever, twins, node: a, li, markSlot, countSlot, noteSlot, layer, track };
  rows.push(row);
  return row;
}

function buildCell(layer, track) {
  const cell = el('div', 'csm-cell csm-cell-' + track.key);
  cell.setAttribute('data-track', track.key);
  cell.setAttribute('data-layer', layer.id);

  const head = el('div', 'csm-cell-head');
  const name = el('a', 'csm-cell-name', layer.name);
  name.href = '#' + layer.id;
  head.appendChild(name);
  const meta = el('div', 'csm-cell-meta');
  const ringSlot = el('span', 'csm-cell-ring');
  meta.appendChild(ringSlot);
  const countSlot = el('span', 'csm-cell-n');
  meta.appendChild(countSlot);
  const gapSlot = el('span', 'csm-cell-gaps');
  gapSlot.hidden = true;
  meta.appendChild(gapSlot);
  head.appendChild(meta);
  cell.appendChild(head);

  const list = el('ul', 'csm-levers');
  const cellRows = layer.levers.map((lever) => {
    const row = buildLeverRow(lever, layer, track);
    list.appendChild(row.li);
    return row;
  });
  cell.appendChild(list);

  const empty = el('p', 'csm-cell-empty', 'No lever here matches the filter.');
  empty.hidden = true;
  cell.appendChild(empty);

  const record = { layer, track, node: cell, list, ringSlot, countSlot, gapSlot, emptyNode: empty, rows: cellRows };
  cells.push(record);
  cellRows.forEach((r) => { r.cell = record; });
  return cell;
}

function buildBoard() {
  const wrap = el('div', 'csm-board');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Every lever by track and actor-layer, with your assessment state');

  // One header per layer column, then per track a full-width banner and its three cells.
  //
  // The track label is a BANNER, not a first column. As a column it was a cell in the grid, so it stretched
  // to the height of the tallest cell in its row -- and Track 2's Agent Harness holds eleven levers, which
  // made "Track 2" a 1,200px slab of solid purple. The banner also buys each cell a full third of the
  // width, which is what stops every lever name wrapping to three lines. Columns still align under their
  // headers, so the grid still reads as two tracks by three layers.
  //
  // The layer names come from the first track's layers: both tracks share the three actor-layers by
  // construction, which is the claim the whole runbook is built on.
  model[0].layers.forEach((layer, i) => {
    const h = el('div', 'csm-colh');
    const glyph = layerGlyph(i);
    if (glyph) h.appendChild(glyph);
    h.appendChild(el('span', 'csm-colh-t', layer.name));
    wrap.appendChild(h);
  });

  bannerMeta = {};
  model.forEach((track) => {
    const rowh = el('div', 'csm-rowh csm-rowh-' + track.key);
    const label = el('a', 'csm-rowh-label');
    label.href = '#' + track.sectionId;
    label.appendChild(el('span', 'csm-rowh-num', track.num));
    label.appendChild(el('span', 'csm-rowh-name', track.name));
    rowh.appendChild(label);
    // The track's own progress, on the track's own banner: directly above the cells it describes, which is
    // a better home for it than the nav row it used to sit in. It is also how a reader sees where the OTHER
    // track stands without leaving this page.
    const meta = el('div', 'csm-rowh-meta');
    rowh.appendChild(meta);
    bannerMeta[track.key] = meta;
    wrap.appendChild(rowh);
    track.layers.forEach((layer) => wrap.appendChild(buildCell(layer, track)));
  });

  // The connector overlay. pointer-events:none in CSS, so it can never intercept a click meant for a row.
  // One path exists from the start and the rest are appended on demand, so "no curve at rest" is an empty
  // `d` on a path that is already there rather than an absent element.
  linkOverlay = svg('svg', { class: 'te-links', 'aria-hidden': 'true' });
  linkPaths = [];
  wrap.appendChild(linkOverlay);
  pathAt(0);

  board = wrap;
  return wrap;
}

/* --------------------------------------------------------------------------------------------------
 * Build: the legend and the shared band
 * ------------------------------------------------------------------------------------------------ */

function buildLegend() {
  const legend = el('div', 'csm-legend');
  ['done', 'progress', 'gap', 'na', 'open'].forEach((state) => {
    const item = el('span', 'csm-legend-key');
    item.appendChild(marker(state));
    item.appendChild(el('span', 'csm-legend-l', STATE_LABEL[state]));
    legend.appendChild(item);
  });
  const shared = el('span', 'csm-legend-key');
  shared.appendChild(el('span', 'te-badge', '⇄ shared'));
  // "in the layer that holds the control there" earns its length: four of the five shared topics sit in the
  // same actor-layer on both tracks and one does not, and without this the exception reads as a mistake.
  shared.appendChild(el('span', 'csm-legend-l',
    'treated on both tracks, in the layer that holds the control there — hover to see its counterpart'));
  legend.appendChild(shared);
  return legend;
}

/* --------------------------------------------------------------------------------------------------
 * The cross-track connector
 * ------------------------------------------------------------------------------------------------ */

/** The i-th curve, appending one if the pool is not that deep yet. */
function pathAt(i) {
  while (linkPaths.length <= i) {
    const p = svg('path', { class: 'te-link' });
    linkOverlay.appendChild(p);
    linkPaths.push(p);
  }
  return linkPaths[i];
}

function clearLinks() {
  linkPaths.forEach((p) => p.removeAttribute('d'));
  if (board) board.classList.remove('has-link');
}

function rowFor(href) {
  for (let i = 0; i < rows.length; i++) if (rows[i].href === href) return rows[i];
  return null;
}

/** A filtered-out row is `display: none`, so its rect is all zeros and a curve to it leaves the board. */
function isDrawable(row) {
  return !!row && !row.node.classList.contains('is-out');
}

/**
 * The `d` of one curve between two rows, in the board's own coordinate space.
 *
 * The two ends can be side by side (same layer column, the two track rows) or diagonal, so the control
 * points lean along whichever axis is longer. That keeps the curve out of the cells it is not about.
 */
function curveBetween(a, b, origin) {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const ax = ra.left + ra.width / 2 - origin.left;
  const ay = ra.top + ra.height / 2 - origin.top;
  const bx = rb.left + rb.width / 2 - origin.left;
  const by = rb.top + rb.height / 2 - origin.top;
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dy) >= Math.abs(dx)) {
    const lean = Math.max(28, Math.abs(dy) * 0.4);
    return 'M' + ax + ',' + ay + ' C' + ax + ',' + (ay + Math.sign(dy || 1) * lean)
      + ' ' + bx + ',' + (by - Math.sign(dy || 1) * lean) + ' ' + bx + ',' + by;
  }
  const lean = Math.max(28, Math.abs(dx) * 0.4);
  return 'M' + ax + ',' + ay + ' C' + (ax + Math.sign(dx || 1) * lean) + ',' + ay
    + ' ' + (bx - Math.sign(dx || 1) * lean) + ',' + by + ' ' + bx + ',' + by;
}

/**
 * Draw one curve per pair, and nothing at all when there is no pair left to draw.
 *
 * More than one curve is not a flourish: right-sizing the model has two counterparts, and drawing only the
 * first would say the other does not exist.
 */
function drawLinks(pairs) {
  clearLinks();
  const live = (pairs || []).filter((p) => p && p.a && p.b);
  if (!live.length || !board) return;
  const origin = board.getBoundingClientRect();
  linkOverlay.setAttribute('viewBox', '0 0 ' + board.offsetWidth + ' ' + board.offsetHeight);
  linkOverlay.setAttribute('width', board.offsetWidth);
  linkOverlay.setAttribute('height', board.offsetHeight);
  live.forEach((p, i) => pathAt(i).setAttribute('d', curveBetween(p.a, p.b, origin)));
  board.classList.add('has-link');
}

/** Drop every highlight. */
function unlitAll() {
  rows.forEach((row) => row.node.classList.remove('twinlit'));
}

/**
 * Light a lever and every counterpart it has, and curve between them.
 *
 * Ends are matched on the RESOLVED lever href, not on the anchor SHARED_TOPICS named: one of the five pairs
 * names a question inside another lever rather than a lever of its own, so the authored anchor has no row of
 * its own to light. See leverHrefFor().
 */
function setTwin(href, on) {
  clearLinks();
  unlitAll();
  if (!on) return;

  const a = rowFor(href);
  const twins = twinsOf[href] || [];
  const ends = twins.map((t) => rowFor(t.href)).filter(isDrawable);
  if (isDrawable(a)) drawLinks(ends.map((b) => ({ a: a.node, b: b.node })));
  if (a) a.node.classList.add('twinlit');
  ends.forEach((b) => b.node.classList.add('twinlit'));
}

function wireConnector() {
  rows.forEach((row) => {
    if (!row.node.hasAttribute('data-twin')) return;
    const on = () => setTwin(row.href, true);
    const off = () => setTwin(row.href, false);
    row.node.addEventListener('mouseenter', on);
    row.node.addEventListener('mouseleave', off);
    row.node.addEventListener('focus', on);
    row.node.addEventListener('blur', off);
  });
  // The board reflows with the viewport, so a curve drawn once would drift. Dropping it is cheaper than
  // recomputing, and it is only ever on while a pair is hovered.
  if (window.ResizeObserver) {
    new ResizeObserver(() => { if (board.classList.contains('has-link')) clearLinks(); }).observe(board);
  }
}

/* --------------------------------------------------------------------------------------------------
 * Render: state onto the built DOM
 * ------------------------------------------------------------------------------------------------ */

function renderRows() {
  rows.forEach((row) => {
    const c = byLever[row.id];
    const state = stateOf(c);
    row.node.setAttribute('data-state', state);

    clear(row.markSlot);
    row.markSlot.appendChild(marker(state));

    const none = state === 'none' ? noneWording(row.lever) : null;
    row.countSlot.textContent = none ? none.word : c.answered + '/' + c.total;
    row.countSlot.classList.toggle('is-none', !!none);
    row.noteSlot.hidden = !(c && c.notes > 0);
    if (c && c.notes > 0) {
      clear(row.noteSlot);
      row.noteSlot.appendChild(el('span', 'csm-note-glyph', '✎'));
      row.noteSlot.appendChild(el('span', 'csm-note-n', c.notes));
      row.noteSlot.title = c.notes === 1 ? 'You left a note on 1 question here' : 'You left notes on ' + c.notes + ' questions here';
    }

    const here = row.id === activeId;
    row.node.classList.toggle('is-here', here);
    if (here) row.node.setAttribute('aria-current', 'true'); else row.node.removeAttribute('aria-current');

    // One sentence per row, because the marker is aria-hidden and the counts are fragments. It names the
    // counterpart too: the connector is a curve on hover, so without this the shared relationship is
    // mouse-only, and where the counterpart sits is the part a reader most often wants.
    row.node.setAttribute('aria-label', row.text + ' — ' + (none ? none.label : STATE_LABEL[state])
      + (none ? '' : ', ' + c.answered + ' of ' + c.total + ' questions answered')
      + (c && c.notes ? ', has notes' : '')
      + (row.twins && row.twins.length ? ', also treated on ' + row.twins.map(describeTwin).join('; ') : '')
      + (here ? ', you are here' : ''));
  });
}

function renderCells() {
  cells.forEach((cell) => {
    const t = totalsOf(cell.layer.levers);
    clear(cell.ringSlot);
    cell.ringSlot.appendChild(ring(t));
    cell.countSlot.textContent = t.total ? t.answered + '/' + t.total : '';
    cell.gapSlot.hidden = t.gaps === 0;
    cell.gapSlot.textContent = t.gaps + (t.gaps === 1 ? ' gap' : ' gaps');
  });
}

function renderTotals() {
  const levers = allLevers();
  const t = totalsOf(levers);
  heroNodes.levers.textContent = String(levers.length);
  heroNodes.answered.textContent = t.total ? t.answered + '/' + t.total : '0';
  heroNodes.gaps.textContent = String(t.gaps);
  heroNodes.gapBox.classList.toggle('is-on', t.gaps > 0);
  heroNodes.noted.textContent = String(t.noted);

  model.forEach((track) => {
    const slot = bannerMeta[track.key];
    if (!slot) return;
    const levs = trackLevers(track);
    const tt = totalsOf(levs);
    clear(slot);
    slot.appendChild(el('span', 'csm-rowh-lev', levs.length + ' levers'));
    // Coverage appears only once the reader has begun. A row of 0/53 on a first visit is discouraging
    // noise rather than information -- the same rule the at-a-glance map follows.
    if (tt.answered > 0) {
      slot.appendChild(el('span', 'csm-rowh-cov', tt.answered + '/' + tt.total + ' answered'));
      if (tt.gaps) slot.appendChild(el('span', 'csm-rowh-gaps', tt.gaps + (tt.gaps === 1 ? ' gap' : ' gaps')));
      if (tt.noted) slot.appendChild(el('span', 'csm-rowh-noted', tt.noted + (tt.noted === 1 ? ' note' : ' noted')));
    }
  });
}

/**
 * Apply the current filter and search.
 *
 * Rows are marked `is-out`, never detached: the whole lever set stays in the document, which is what keeps
 * this a navigation aid rather than a second, filtered copy of the runbook's contents.
 */
function applyFilter() {
  const filter = FILTERS.find((f) => f.key === filterKey) || FILTERS[0];
  let shown = 0;

  rows.forEach((row) => {
    const c = byLever[row.id];
    const hitFilter = filter.test(c);
    const hitQuery = !query || row.text.toLowerCase().indexOf(query) !== -1;
    const inView = hitFilter && hitQuery;
    // The class goes on BOTH the row and its <li>. Hiding only the row leaves the list item as a zero-height
    // grid track that still contributes its gap, so a cell showing one of nine levers kept eight rows' worth
    // of empty space. A CLASS rather than `hidden`, so the print rule can put them back -- `[hidden]` is
    // forced with `!important` in 10-base.css and cannot be undone.
    row.node.classList.toggle('is-out', !inView);
    row.li.classList.toggle('is-out', !inView);
    if (inView) shown++;
  });

  cells.forEach((cell) => {
    const any = cell.rows.some((r) => !r.node.classList.contains('is-out'));
    cell.emptyNode.hidden = any;
    cell.node.classList.toggle('is-empty', !any);
  });

  FILTERS.forEach((f) => {
    const chip = barNodes.chips[f.key];
    if (!chip) return;
    const on = f.key === filterKey;
    chip.button.classList.toggle('is-on', on);
    chip.button.setAttribute('aria-pressed', on ? 'true' : 'false');
    // Each chip states how many levers it would show, so the reader can see there is nothing behind it
    // before clicking. "All" says the total.
    const n = f.key === 'all' ? rows.length : rows.filter((r) => f.test(byLever[r.id])).length;
    chip.n.textContent = String(n);
    chip.button.disabled = n === 0 && f.key !== 'all' && f.key !== filterKey;
  });

  const filtering = filterKey !== 'all' || !!query;
  barNodes.clear.hidden = !filtering;
  barNodes.showing.textContent = filtering
    ? 'Showing ' + shown + ' of ' + rows.length + ' levers'
    : rows.length + ' levers';
}

function render() {
  renderRows();
  renderCells();
  renderTotals();
  applyFilter();
}

/* --------------------------------------------------------------------------------------------------
 * Where the command bar sticks
 * ------------------------------------------------------------------------------------------------ */

/**
 * Publish the real height of the two things already stuck to the top of the viewport.
 *
 * The command bar has to stick BELOW both the top bar and the sticky breadcrumb. Expressing that as a
 * constant means guessing the breadcrumb's height, and the guess was wrong by 11px -- the bar slid under it
 * and its filters became unclickable. Measuring is exact, and it re-measures on resize, where the breadcrumb
 * wraps to two lines at narrow widths and the constant would be wrong again in the other direction.
 *
 * A CSSOM write (`style.setProperty`), never a style attribute: the site's `style-src 'self'` governs the
 * attribute and not this. 00-tokens.css keeps a sensible fallback for the no-JS case.
 */
function syncStickyOffset() {
  const crumb = document.querySelector('.breadcrumb');
  if (!crumb) return;
  // The breadcrumb's OWN sticky `top`, not the top bar's height. Those differ: the bar is 48px tall and the
  // breadcrumb is pinned at 56px, so measuring the bar put the command bar 8px too high and it slid under.
  // Whatever the breadcrumb is pinned at, plus how tall it is, is where the next sticky line begins.
  const pinned = parseFloat(getComputedStyle(crumb).top);
  const top = (Number.isFinite(pinned) ? pinned : 56) + crumb.offsetHeight;
  document.documentElement.style.setProperty('--sticky-2', top + 'px');
}

/* --------------------------------------------------------------------------------------------------
 * Wiring
 * ------------------------------------------------------------------------------------------------ */

export function buildCostMap() {
  const mount = document.getElementById('trackExplorer');
  if (!mount) return;
  model = buildModel();
  if (!model.length) return;   // not the runbook; leave the fallback table as the whole figure

  twinsOf = buildTwins();

  mount.appendChild(buildHero());
  mount.appendChild(buildBar());
  mount.appendChild(buildBoard());
  mount.appendChild(buildLegend());
  mount.hidden = false;

  // The authored lever-index table is this figure's no-JS fallback: with JavaScript off it is the only list of
  // levers on the pane, which is why verify-runbook-dom.mjs asserts it is in the document. Once the board is
  // built it is a second, collapsed copy of the same taxonomy, so it is switched OFF rather than deleted --
  // the same progressive-enhancement swap the rail's fallback list and the lever sheet's fallback both make,
  // and it keeps the content-integrity count of authored tables intact.
  const leverIndex = document.querySelector('.lever-index.is-fallback');
  if (leverIndex) leverIndex.hidden = true;

  wireConnector();
  syncStickyOffset();
  window.addEventListener('resize', syncStickyOffset, { passive: true });

  // Coverage arrives after this module is built (assessment() runs later in main.mjs and fires on init), so
  // the first paint is the empty state and the first event fills it in.
  document.addEventListener('runbook:coverage', (e) => {
    byLever = (e.detail && e.detail.byLever) || {};
    render();
  });

  document.addEventListener('runbook:active', (e) => {
    const next = (e.detail && e.detail.id) || null;
    if (next === activeId) return;
    activeId = next;
    // Only the "you are here" marks change on scroll; recomputing the counts would be wasted work on
    // every scroll event.
    renderRows();
  });

  render();
}
