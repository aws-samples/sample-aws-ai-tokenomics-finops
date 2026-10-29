/**
 * The TLDR pane's lever sheet: all 34 levers, what each one saves, grouped by track and actor-layer.
 *
 * WHY. Leadership wanted "the key levers I can pull to cost optimise, by track" on about two pages, and went
 * looking for it on the front page without finding it. What was there instead was 1,691 words restating the
 * two-tracks-by-three-layers taxonomy five times before naming a single lever.
 *
 * NOTHING HERE IS AUTHORED TWICE
 * ------------------------------
 * Every value on this sheet is read out of the document, which is the rule the whole runbook front end
 * follows (`model.mjs`: "nothing is discovered from a hard-coded list"). A hand-written summary of 34 levers
 * would have been a sixth restatement of the taxonomy and the first thing to go stale:
 *
 *   track -> layer -> lever, shared, kind   buildModel()
 *   the track's economics line              `.trk-card-econ` in "Which track am I in?"
 *   the layer's one-liner                   `.cell-hint` in the at-a-glance mapcard
 *   the lever's headline saving             `.saves-head` inside the lever's own "What it saves:" paragraph
 *   the three decision principles           the <h4>s under `h3#decision-principles`
 *
 * `.saves-head` is the one thing this feature added to the content, and it was added INSIDE the existing
 * paragraph rather than beside it. The lever body renders the whole sentence; this renders the span. One
 * statement, two renderings -- so they cannot drift, and a check can assert 33 spans against 33 rows instead
 * of a reviewer having to notice.
 *
 * ATTRIBUTION IS BY POSITION, NOT BY A LOOKUP
 * -------------------------------------------
 * A lever's headline is found by walking headings and spans in DOCUMENT ORDER and taking the first span
 * after each heading. Two levers carry their "What it saves:" paragraph nested several elements deep rather
 * than as a sibling of the heading, so a `nextElementSibling` walk would silently miss them and report those
 * levers as having no saving. Document order cannot miss them, and it is the same rule `assessment.mjs`
 * attributes questions to levers by, for the same reason: an attribute can drift, a position cannot.
 *
 * A LEVER WITH NO SAVING IS DESCRIBED, NEVER INVENTED
 * --------------------------------------------------
 * `#precise-specifications-to-avoid-rework` declares `data-lever-kind="cross-reference"`: it is a pointer to
 * the treatment on the other track and has no assessment and no saving of its own. Its row reads
 * "reference". A lever that is missing a headline WITHOUT declaring itself a cross-reference reads
 * "no headline" -- a description of what is there, not a claim about intent -- and the check fails, so no
 * reader should ever see it. That is the same distinction the cost structure map draws between a declared
 * and an undeclared absence, and it exists because inferring intent from an absence reports the second as
 * the first.
 */

import { el, clear } from './viz/svg.mjs';
import { buildModel, headingText } from './model.mjs';

/**
 * Every lever's headline saving, keyed by lever id.
 *
 * One pass over `h4[id]` and `.saves-head` together, which `querySelectorAll` returns in document order.
 * First span wins: `decision-guidance-cost-aware-model-routing` carries a second "What it saves:" for the
 * gateway cost-safety sub-topic inside it, which is that sub-topic's saving and not the lever's.
 */
export function headlines() {
  const out = {};
  let lever = null;
  document.querySelectorAll('main.content h4[id], main.content .saves-head').forEach((node) => {
    if (node.tagName === 'H4') { lever = node.id; return; }
    if (!lever || out[lever]) return;
    out[lever] = node.textContent.trim();
  });
  return out;
}

/** The layer's one-liner, from the cell that already states it in the at-a-glance mapcard. */
function layerHint(layerId) {
  const cell = document.querySelector('.mapgrid a.cell[href="#' + layerId + '"] .cell-hint');
  return cell ? cell.textContent.trim() : '';
}

/** The track's economics line, from the choice card that already states it. */
function trackEcon(key) {
  const node = document.querySelector('.trk-card-' + key + ' .trk-card-econ');
  return node ? node.textContent.trim() : '';
}

/**
 * The three principles that do not change with the track.
 *
 * They are single-homed in "Synthesis and next steps" by design -- the runbook covers them once because they
 * are literally identical on both tracks. Naming them here rather than only linking to them is the
 * compromise this pane makes: `the front-end design notes` deliberately put them in the orientation
 * scope "so a reader carries them IN rather than meeting them after the work", and under panes their section
 * sits in Reference. Deriving the titles keeps that intent without moving the section or copying its prose.
 */
function principles() {
  const h3 = document.getElementById('decision-principles');
  if (!h3 || !h3.parentElement) return [];
  const out = [];
  let node = h3.nextElementSibling;
  while (node) {
    if (node.tagName === 'H3' || node.tagName === 'H2') break;
    if (node.tagName === 'H4' && node.id) out.push({ id: node.id, text: headingText(node) });
    node = node.nextElementSibling;
  }
  return out;
}

function leverRow(lever, heads) {
  const li = el('li', 'ls-lever');

  const name = el('a', 'ls-lever-name', lever.text);
  name.href = '#' + lever.id;
  li.appendChild(name);

  if (lever.shared) {
    const tag = el('span', 'ls-shared', '⇄ shared');
    tag.title = 'This topic is treated on both tracks, phrased for the way each one operates.';
    li.appendChild(tag);
  }

  const head = heads[lever.id];
  if (head) {
    li.appendChild(el('span', 'ls-saves', head));
  } else if (lever.kind === 'cross-reference') {
    li.appendChild(el('span', 'ls-saves is-ref', 'reference'));
  } else {
    // Descriptive, not a claim -- and the DOM check fails on it, so it should never ship.
    li.appendChild(el('span', 'ls-saves is-none', 'no headline'));
  }
  return li;
}

function trackBlock(track, heads) {
  const wrap = el('div', 'ls-track ls-' + track.key);

  const head = el('div', 'ls-track-h');
  head.appendChild(el('span', 'ls-track-num', track.num));
  if (track.name) head.appendChild(el('span', 'ls-track-name', track.name));
  const econ = trackEcon(track.key);
  if (econ) head.appendChild(el('span', 'ls-track-econ', econ));
  wrap.appendChild(head);

  track.layers.forEach((layer) => {
    const block = el('div', 'ls-layer');
    const lh = el('div', 'ls-layer-h');
    const link = el('a', 'ls-layer-name', layer.name);
    link.href = '#' + layer.id;
    lh.appendChild(link);
    const n = layer.levers.length;
    lh.appendChild(el('span', 'ls-layer-n', n + (n === 1 ? ' lever' : ' levers')));
    const hint = layerHint(layer.id);
    if (hint) lh.appendChild(el('span', 'ls-layer-hint', hint));
    block.appendChild(lh);

    const list = el('ul', 'ls-levers');
    layer.levers.forEach((lever) => list.appendChild(leverRow(lever, heads)));
    block.appendChild(list);
    wrap.appendChild(block);
  });

  return wrap;
}

export function buildLeverSheet() {
  const mount = document.getElementById('leverSheet');
  if (!mount) return;
  const model = buildModel();
  if (!model.length) return;   // not the runbook; leave the authored fallback in place

  const heads = headlines();
  clear(mount);

  model.forEach((track) => mount.appendChild(trackBlock(track, heads)));

  const three = principles();
  if (three.length) {
    const block = el('div', 'ls-principles');
    const lh = el('div', 'ls-layer-h');
    const link = el('a', 'ls-layer-name', 'Decision principles');
    link.href = '#decision-principles';
    lh.appendChild(link);
    lh.appendChild(el('span', 'ls-layer-n', 'both tracks'));
    lh.appendChild(el('span', 'ls-layer-hint', 'identical whichever track you run, so covered once'));
    block.appendChild(lh);
    const list = el('ul', 'ls-levers');
    three.forEach((p) => {
      const li = el('li', 'ls-lever');
      const a = el('a', 'ls-lever-name', p.text);
      a.href = '#' + p.id;
      li.appendChild(a);
      list.appendChild(li);
    });
    block.appendChild(list);
    mount.appendChild(block);
  }

  // The authored fallback is a real paragraph that routes to the lever index, so it has to be switched off
  // rather than merely covered. Same pattern as `.rail-fallback`, and the reason 10-base.css forces
  // `[hidden] { display: none !important }`: the attribute alone loses to any class that sets a display.
  mount.hidden = false;
  const fallback = document.querySelector('#key-levers .sheet-fallback');
  if (fallback) fallback.hidden = true;
}
