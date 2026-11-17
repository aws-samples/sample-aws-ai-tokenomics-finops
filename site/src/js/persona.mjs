/**
 * Persona filter: show only the questions the reader's role acts on, across every layer.
 *
 * Each question carries `data-personas` (governance, developer, builder); `ai-pm-leader` is the all-questions
 * view and is never a tag. A picker in each track dashboard chooses the role, and the choice applies to both
 * tracks. A question outside the role is hidden and marked `data-persona-out`; a lever with none left is hidden
 * with its sidebar entry and its `.assess` block marked `data-persona-out`. assessment.mjs reads those attributes
 * the same way it reads `data-scope-out`, so every tally, panel, dashboard, the cost map, the wayfinder and the
 * exports follow, and the export names what it skipped. Content is only hidden, never removed.
 *
 * Without JavaScript the pickers stay `hidden` and every question shows. The lever-level hide is a class rather
 * than `hidden` because scope.mjs owns `hidden` on the same nodes; two writers of one attribute would undo each
 * other. Persistence is its own localStorage key, so clearing answers never changes the role.
 */

var STORE = 'tokenomics-assessment-persona-v1';
export var ALL_PERSONA = 'ai-pm-leader';

export function initPersona() {
  var pickers = Array.prototype.slice.call(document.querySelectorAll('[data-persona-picker]'));
  if (!pickers.length) return;
  var root = document.documentElement;

  var labels = {};
  Array.prototype.forEach.call(pickers[0].querySelectorAll('input[type="radio"]'), function (i) {
    labels[i.value] = i.parentElement.textContent.trim();
  });
  var current = load();
  if (!labels[current]) current = ALL_PERSONA;

  var questions = Array.prototype.slice.call(document.querySelectorAll('[data-assess-q]'));

  // One record per lever: its questions, the page nodes from its heading to the next boundary (the same region
  // rule as scope.mjs) and its sidebar entries.
  var levers = Array.prototype.slice.call(document.querySelectorAll('.assess[data-assess-lever]')).map(function (box) {
    var h4 = box.previousElementSibling;
    while (h4 && !(h4.tagName === 'H4' && h4.id)) h4 = h4.previousElementSibling;
    var nodes = [];
    for (var n = h4; n; n = n.nextElementSibling) {
      if (n !== h4 && n.matches('h4[id], h3, figure, .assess-report, [data-scope-picker]')) break;
      nodes.push(n);
    }
    var nav = h4 ? Array.prototype.slice.call(document.querySelectorAll('#sidebar a.nav-link[href="#' + h4.id + '"]'))
      .map(function (a) { return a.closest('li') || a; }) : [];
    return { box: box, qs: Array.prototype.slice.call(box.querySelectorAll('[data-assess-q]')), nodes: nodes, nav: nav };
  });

  function tagsOf(q) { return (q.getAttribute('data-personas') || '').split(/\s+/); }

  function apply(silent) {
    root.setAttribute('data-persona', current);
    root.setAttribute('data-persona-label', labels[current]);
    questions.forEach(function (q) {
      var out = current !== ALL_PERSONA && tagsOf(q).indexOf(current) === -1;
      q.hidden = out;
      if (out) q.setAttribute('data-persona-out', ''); else q.removeAttribute('data-persona-out');
    });
    levers.forEach(function (rec) {
      var none = rec.qs.every(function (q) { return q.hasAttribute('data-persona-out'); });
      if (none) rec.box.setAttribute('data-persona-out', ''); else rec.box.removeAttribute('data-persona-out');
      rec.nodes.concat(rec.nav).forEach(function (n) { n.classList.toggle('persona-off', none); });
    });
    pickers.forEach(function (p) {
      Array.prototype.forEach.call(p.querySelectorAll('input[type="radio"]'), function (i) { i.checked = i.value === current; });
      var count = p.querySelector('[data-persona-count]');
      var track = p.closest('section.track-route');
      if (!count || !track) return;
      var all = track.querySelectorAll('[data-assess-q]').length;
      var shown = track.querySelectorAll('[data-assess-q]:not([data-persona-out])').length;
      var name = (track.querySelector('h2') || {}).textContent || 'This track';
      var trackName = name.split(' - ')[0];
      count.textContent = current === ALL_PERSONA ? 'Showing all ' + all + ' questions.'
        : shown ? 'Showing ' + shown + ' of ' + all + ' questions for ' + labels[current] + '.'
          : trackName + ' has no questions for ' + labels[current] + '. Choose the other track, or All questions.';
    });
    if (!silent) document.dispatchEvent(new CustomEvent('runbook:persona', { detail: { persona: current } }));
  }

  pickers.forEach(function (p) {
    p.hidden = false;
    p.addEventListener('change', function (e) {
      var input = e.target.closest('input[type="radio"]');
      if (!input || !labels[input.value]) return;
      current = input.value;
      save();
      apply(false);
    });
  });

  // First paint: mark the DOM before the assessment counts anything (main.mjs runs this before assessment()).
  apply(true);

  function load() { try { return localStorage.getItem(STORE) || ALL_PERSONA; } catch (e) { return ALL_PERSONA; } }
  function save() { try { localStorage.setItem(STORE, current); } catch (e) {} }
}
