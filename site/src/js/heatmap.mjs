/**
 * Effort against impact, for the levers this runbook actually ranks.
 *
 * WHY. "The key levers I can pull" is a question about order, not inventory: which of these do I do first,
 * and which need engineering I have to fund. The sheet below answers "what is there"; this answers "where do
 * I start". It is the first thing in the TLDR pane for that reason.
 *
 * WHERE THE RATINGS COME FROM, AND WHERE THEY STOP
 * ------------------------------------------------
 * `data-effort` and `data-impact` on a lever's own heading, and they are only present on the ten levers that
 * `#top-levers-by-effort-to-savings` already ranks and states an effort for in prose. That table is authored,
 * cited, and published; mapping its Effort column onto three bands is a reading of existing content rather
 * than a new claim.
 *
 * The other 24 levers carry no rating, and this renders none for them. That is the point, not a gap to paper
 * over: a rating here would be the least-evidenced statement in a document that carries 77 references and
 * marks every reported figure as reported, sitting in the most prominent position it has. So the grid renders
 * only the impact rows that HAVE levers -- which today is a ladder across the effort axis, because the source
 * table ranks top levers and everything in it is high-impact by construction -- and the footer states how
 * many levers are unrated. It grows into a full grid the moment more ratings are declared, with no code
 * change. NO SILENT CAPS: a view that showed ten of 34 without saying so would read as the whole picture.
 *
 * THE SIX ENABLER LEVERS ARE NOT SHOWN HERE, AND ARE NOT MISFILED EITHER
 * ----------------------------------------------------------------------
 * Six levers save nothing directly and everything downstream -- metering, cost attribution, developer
 * education, quota mechanics, application inference profiles, agent loop amplification. This view once lifted
 * them into a "Prerequisites" band above the grid; that was removed as confusing rather than clarifying.
 *
 * What matters is that removing the band did NOT put them in "low impact", which would have told a reader to
 * skip the things that make every other saving measurable. They carry no effort or impact rating, so they are
 * simply absent from the grid -- the same treatment as any other unrated lever, and counted in the "N of 34
 * placed" line below it. Each one still states its saving in the sheet on this same pane, where its headline
 * begins "Enabler" and says plainly that it saves nothing on its own.
 */

import { el, clear } from './viz/svg.mjs';
import { buildModel } from './model.mjs';
import { headlines } from './levers-sheet.mjs';

const EFFORT = ['low', 'medium', 'high'];
const IMPACT = ['high', 'medium', 'low'];

// Effort ticks are bare values (Low/Medium/High); the axis names itself once, in `.hm-axis-x` below the
// plot, rather than on every column — the same anatomy a real chart's x-axis uses. Impact stays full
// ("High impact") because there is no matching y-axis caption: with at most two rows, one of which is
// always "High impact", a caption would earn its keep less than the row header already does on its own.
const EFFORT_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
const IMPACT_LABEL = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };

/** The one cell worth naming: cheapest thing that moves the bill most. */
const QUICK_WIN = { impact: 'high', effort: 'low' };

/** Flatten the model to levers, carrying the track each belongs to and whatever it declares about itself. */
function ratedLevers(model, heads) {
  const out = [];
  model.forEach((track) => track.layers.forEach((layer) => layer.levers.forEach((lever) => {
    const node = document.getElementById(lever.id);
    out.push({
      id: lever.id,
      text: lever.text,
      track: track.key,
      shared: lever.shared,
      head: heads[lever.id] || '',
      effort: node ? node.getAttribute('data-effort') : null,
      impact: node ? node.getAttribute('data-impact') : null
    });
  })));
  return out;
}

function chip(lever) {
  const a = el('a', 'hm-chip hm-' + lever.track);
  a.href = '#' + lever.id;
  a.appendChild(el('span', 'hm-chip-name', lever.text));
  if (lever.head) a.appendChild(el('span', 'hm-chip-saves', lever.head));
  a.title = lever.text + (lever.head ? ' — ' + lever.head : '');
  return a;
}

export function buildHeatmap() {
  const mount = document.getElementById('leverHeat');
  if (!mount) return;
  const model = buildModel();
  if (!model.length) return;

  const heads = headlines();
  const levers = ratedLevers(model, heads);

  // A lever is on the grid if, and only if, it declares both bands. Nothing is inferred from an absence.
  const gridable = levers.filter((l) => l.effort && l.impact);

  clear(mount);

  // Only the impact rows that have something in them. With ten levers rated this is one row, and a grid with
  // two empty rows would be a claim that nothing is medium- or low-impact rather than that nothing is rated.
  const rows = IMPACT.filter((impact) => gridable.some((l) => l.impact === impact));

  if (rows.length) {
    const grid = el('div', 'hm-grid');
    grid.setAttribute('data-rows', String(rows.length));

    grid.appendChild(el('div', 'hm-corner'));
    EFFORT.forEach((effort) => grid.appendChild(el('div', 'hm-col-h', EFFORT_LABEL[effort])));

    rows.forEach((impact) => {
      grid.appendChild(el('div', 'hm-row-h', IMPACT_LABEL[impact]));
      EFFORT.forEach((effort) => {
        const cell = el('div', 'hm-cell');
        cell.setAttribute('data-impact', impact);
        cell.setAttribute('data-effort', effort);
        const here = gridable.filter((l) => l.impact === impact && l.effort === effort);
        if (impact === QUICK_WIN.impact && effort === QUICK_WIN.effort && here.length) {
          cell.appendChild(el('div', 'hm-cell-t', 'Quick wins'));
        }
        if (!here.length) {
          cell.classList.add('is-empty');
        } else {
          here.forEach((l) => cell.appendChild(chip(l)));
        }
        grid.appendChild(cell);
      });
    });

    // Decorative x-axis caption ("chart", not "table"). A grid item of `grid`, not a sibling, so
    // `grid-column: 2 / -1` in CSS spans exactly the effort columns regardless of the row-header
    // column's actual rendered width -- that column is a flexible `minmax(0, 7.5rem)`, so a hardcoded
    // margin here would drift from it on any viewport where it has shrunk.
    //
    // aria-hidden because every column already carries "Low"/"Medium"/"High" as an accessible tick
    // label; this only supplies the axis name a sighted reader expects to see once, below the plot,
    // rather than repeated on every tick.
    const axis = el('p', 'hm-axis-x', 'Effort →');
    axis.setAttribute('aria-hidden', 'true');
    grid.appendChild(axis);

    mount.appendChild(grid);
  }

  // State the coverage rather than implying there is none to state.
  const total = levers.length;
  const rated = gridable.length;
  const foot = el('p', 'hm-foot');
  foot.appendChild(el('span', 'hm-foot-n',
    rated + ' of ' + total + ' levers placed'));
  foot.appendChild(document.createTextNode(
    ' — from the runbook’s own ranking in '));
  const link = el('a', null, 'Top levers by effort-to-savings');
  link.href = '#top-levers-by-effort-to-savings';
  foot.appendChild(link);
  foot.appendChild(document.createTextNode(
    '. Bands are a reading of that table, not a benchmark; every figure is cited in the lever itself. '
    + 'The remaining ' + (total - rated) + ' are listed below with what they save.'));
  mount.appendChild(foot);

  mount.hidden = false;
}
