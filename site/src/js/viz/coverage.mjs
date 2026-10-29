/**
 * The coverage meter: how much of a layer has been assessed, and how it came out.
 *
 * One component, used by all six per-layer summary panels and by the cross-layer dashboard, so the
 * runbook never ships two different-looking answers to the same question.
 *
 * What it replaced, and why
 * -------------------------
 * Four `<span>`s in a flex row with percentage widths, no numbers on the bar, no legend, and no
 * accessible value. Two problems beyond the plain look:
 *
 * 1. The widths were written as inline style attributes through innerHTML, which the site's CSP blocks,
 *    which in turn forced `build-runbook-app.mjs` to carry a byte-exact string patch over that exact
 *    source text. Geometry here is SVG `x`/`width` ATTRIBUTES, which CSP does not govern, so the patch
 *    is gone and reindenting this file cannot break a deploy.
 *
 * 2. Identity was carried by colour alone, and the two colours that mattered most were the two a
 *    reader could least tell apart. Measured with the dataviz skill's validator, the old
 *    positive/caution pair (#7AA116 / #B7791F) sat at ΔE 2.6 for deuteranopia and 13.8 for normal
 *    vision -- below the 15 floor, i.e. hard to distinguish even with full colour vision. "Fully
 *    covered" and "Partially" looked the same, which is precisely the distinction the assessment
 *    exists to draw. The palette in 90-assess.css was re-stepped until the validator passed, and every
 *    segment now also carries a number and a legend entry, so colour is never the only channel.
 *
 * Encoding
 * --------
 * Length encodes count. The bar's full width is every question in scope, so the unfilled remainder is
 * "not yet answered" -- progress and result are readable in one mark, which is what a reader working
 * through a layer actually wants to know. Segment order is the maturity order (covered, partial, not
 * covered, N/A) so the bar reads left-to-right worst-to-best-filled and does not reorder as answers
 * change. Colour follows the state, never its size.
 */

import { svg, el, clear } from './svg.mjs';

/** Maturity states, in fixed display order. Tokens must stay yes/wip/no/na (storage + CSS depend). */
const SERIES = [
  { key: 'yes', cls: 'cov-yes', label: 'Fully covered' },
  { key: 'wip', cls: 'cov-wip', label: 'Partially' },
  { key: 'no', cls: 'cov-no', label: 'Not covered' },
  { key: 'na', cls: 'cov-na', label: 'N/A' }
];

const H = 12;   // bar height, in user units
const GAP = 2;  // surface gap between segments, so adjacent fills read as separate marks

// No `rx` on any shape. The viewBox is in COUNT units and the bar is stretched to the container with
// preserveAspectRatio="none", so a corner radius expressed in user units is stretched horizontally too
// and the bar's end renders as a long taper rather than a 4px round. The rounding is therefore applied
// in CSS on the <svg> itself (border-radius + overflow: hidden), where it is in real pixels.

/**
 * Render the meter into `mount`.
 * @param {HTMLElement} mount container, typically `[data-ar-coverage]`
 * @param {{yes:number,wip:number,no:number,na:number,answered:number,total:number}} c counts
 * @param {{compact?: boolean, title?: string}} [opts] compact drops the legend (dashboard rows)
 */
export function renderCoverage(mount, c, opts) {
  const options = opts || {};
  clear(mount);
  mount.classList.add('cov');
  mount.classList.toggle('cov-compact', !!options.compact);

  if (!c || !c.total) return;

  const unanswered = Math.max(0, c.total - c.answered);
  const present = SERIES.filter((s) => c[s.key] > 0);

  // A viewBox in count units means one unit of width is exactly one question: no scaling maths, and
  // the bar stays crisp at any rendered width. preserveAspectRatio="none" lets it stretch to the
  // container while the height stays fixed in user units.
  const W = c.total;
  const bar = svg('svg', {
    class: 'cov-bar',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'none',
    height: H,
    role: 'img',
    'aria-label': accessibleLabel(c, options.title)
  });

  // Track: the whole scope, so the gap at the right is "still to answer".
  bar.appendChild(svg('rect', { class: 'cov-track', x: 0, y: 0, width: W, height: H }));

  let x = 0;
  present.forEach((s, i) => {
    const w = c[s.key];
    // Inset by the gap on the inner side only, so segments are visibly separate without the bar
    // appearing to shrink. Guard against a 1-question segment collapsing to nothing.
    const inset = i === 0 ? 0 : GAP;
    const drawW = Math.max(0.35, w - inset);
    bar.appendChild(svg('rect', { class: 'cov-seg ' + s.cls, x: x + inset, y: 0, width: drawW, height: H }));
    x += w;
  });

  mount.appendChild(bar);

  // Numbers and identity. Mandatory, not decoration: the validator flags these fills as below 3:1
  // contrast against the surface, and that warning is discharged by visible labels rather than
  // dismissed. It is also what keeps identity off colour-alone.
  if (!options.compact) {
    const legend = el('div', 'cov-legend');
    legend.setAttribute('aria-hidden', 'true'); // the bar's aria-label already says all of this
    SERIES.forEach((s) => {
      const item = el('span', 'cov-key' + (c[s.key] ? '' : ' is-zero'));
      item.appendChild(svg('svg', { class: 'cov-swatch ' + s.cls, viewBox: '0 0 10 10', width: 10, height: 10 },
        [svg('rect', { x: 0, y: 0, width: 10, height: 10, rx: 3 })]));
      item.appendChild(el('span', 'cov-key-n', c[s.key]));
      item.appendChild(el('span', 'cov-key-l', s.label));
      legend.appendChild(item);
    });
    if (unanswered > 0) {
      const item = el('span', 'cov-key cov-key-open');
      item.appendChild(el('span', 'cov-key-n', unanswered));
      item.appendChild(el('span', 'cov-key-l', 'not yet answered'));
      legend.appendChild(item);
    }
    mount.appendChild(legend);
  }
}

/** The whole meter in one sentence, for screen readers and for the exported report. */
export function accessibleLabel(c, title) {
  if (!c || !c.total) return 'No questions in scope.';
  const parts = SERIES.filter((s) => c[s.key] > 0).map((s) => `${c[s.key]} ${s.label.toLowerCase()}`);
  const open = c.total - c.answered;
  if (open > 0) parts.push(`${open} not yet answered`);
  const pct = Math.round((c.answered / c.total) * 100);
  return `${title ? title + ' coverage: ' : 'Coverage: '}${c.answered} of ${c.total} questions answered (${pct}%). `
    + (parts.length ? parts.join(', ') + '.' : '');
}
