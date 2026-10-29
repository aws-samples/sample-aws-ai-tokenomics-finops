/**
 * Assessment scope: which levers the reader has taken OUT of their assessment.
 *
 * Track 2 carries levers that do not apply to every workload (self-hosting, a multi-agent orchestration, a
 * session-cost meter in a customer-facing product). Under each Track 2 figure a picker lists that layer's
 * levers; unticking one, or clicking its box in the figure, hides the lever (heading, why, assessment block
 * and saves line) and marks its `.assess` block `data-scope-out`, which is the ONE contract the assessment
 * module reads to leave those questions out of every tally, panel, dashboard and export. Content is never
 * removed from the document, only hidden: the repo's content-integrity guarantee holds by construction, the
 * same way the track focus does for navigation.
 *
 * The picker is the accessible control. The figure boxes are `role="img"` content, so a click there is a
 * convenience for pointer users and is mirrored to the checkbox, not the other way round.
 *
 * Persistence is a separate localStorage key from the answers, so clearing one never clears the other by
 * accident; the assessment's own Reset does reset scope, through `runbook:scope-reset`.
 */

var STORE = 'tokenomics-assessment-scope-v1';

export function initScope() {
  var pickers = Array.prototype.slice.call(document.querySelectorAll('[data-scope-picker]'));
  if (!pickers.length) return;

  var out = load();
  var levers = {};

  // Collect, per lever id: the nodes that belong to it on the page, its sidebar entry and its figure boxes.
  pickers.forEach(function (p) {
    Array.prototype.forEach.call(p.querySelectorAll('input[data-scope-lever]'), function (input) {
      var id = input.getAttribute('data-scope-lever');
      var h4 = document.getElementById(id);
      if (!h4) return;
      var rec = levers[id] || (levers[id] = { id: id, inputs: [], nodes: [], boxes: [], nav: [], assess: null, name: '' });
      rec.inputs.push(input);
      rec.name = input.parentElement.textContent.trim();
      if (!rec.nodes.length) {
        var node = h4;
        while (node) {
          if (node !== h4 && (node.matches('h4[id], h3, figure, .assess-report, [data-scope-picker]'))) break;
          rec.nodes.push(node);
          if (node.matches('.assess')) rec.assess = node;
          node = node.nextElementSibling;
        }
      }
      rec.boxes = Array.prototype.slice.call(document.querySelectorAll('svg [data-scope-lever="' + id + '"]'));
      rec.nav = Array.prototype.slice.call(document.querySelectorAll('#sidebar a.nav-link[href="#' + id + '"]')).map(function (a) { return a.closest('li') || a; });
    });
  });

  function apply(silent) {
    Object.keys(levers).forEach(function (id) {
      var rec = levers[id];
      var off = out.indexOf(id) !== -1;
      rec.nodes.forEach(function (n) { n.hidden = off; });
      rec.nav.forEach(function (n) { n.hidden = off; });
      rec.boxes.forEach(function (b) { b.classList.toggle('df-off', off); });
      rec.inputs.forEach(function (i) { i.checked = !off; });
      if (rec.assess) {
        if (off) rec.assess.setAttribute('data-scope-out', ''); else rec.assess.removeAttribute('data-scope-out');
      }
    });
    pickers.forEach(function (p) {
      var note = p.querySelector('[data-scope-out-note]');
      if (!note) return;
      var names = Array.prototype.slice.call(p.querySelectorAll('input[data-scope-lever]'))
        .filter(function (i) { return !i.checked; })
        .map(function (i) { return levers[i.getAttribute('data-scope-lever')].name; });
      note.hidden = names.length === 0;
      note.textContent = names.length ? 'Out of scope: ' + names.join(', ') + '.' : '';
    });
    if (!silent) {
      document.dispatchEvent(new CustomEvent('runbook:scope', { detail: { out: out.slice() } }));
    }
  }

  function setOut(id, off) {
    var i = out.indexOf(id);
    if (off && i === -1) out.push(id);
    if (!off && i !== -1) out.splice(i, 1);
    save();
    apply(false);
  }

  pickers.forEach(function (p) {
    p.addEventListener('change', function (e) {
      var input = e.target.closest('input[data-scope-lever]');
      if (!input) return;
      setOut(input.getAttribute('data-scope-lever'), !input.checked);
    });
  });

  // Figure boxes: pointer convenience, mirrored to the checkbox.
  Array.prototype.forEach.call(document.querySelectorAll('svg.decflow'), function (svg) {
    if (!svg.querySelector('[data-scope-lever]')) return;
    svg.classList.add('has-scope');
    svg.addEventListener('click', function (e) {
      var g = e.target.closest('[data-scope-lever]');
      if (!g || !svg.contains(g)) return;
      var id = g.getAttribute('data-scope-lever');
      if (!levers[id]) return;
      setOut(id, out.indexOf(id) === -1);
    });
  });

  // The assessment's Reset button re-includes every lever in the scopes it reset.
  document.addEventListener('runbook:scope-reset', function (e) {
    var scopes = (e.detail && e.detail.scopes) || [];
    var changed = false;
    Object.keys(levers).forEach(function (id) {
      var rec = levers[id];
      var group = rec.assess && rec.assess.getAttribute('data-assess-group');
      if (scopes.indexOf(group) !== -1 && out.indexOf(id) !== -1) { out.splice(out.indexOf(id), 1); changed = true; }
    });
    if (changed) { save(); apply(false); }
  });

  // First paint: mark the DOM before the assessment counts anything, and tell it once it is listening.
  apply(true);
  document.dispatchEvent(new CustomEvent('runbook:scope', { detail: { out: out.slice(), initial: true } }));

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(out)); } catch (e) {} }
}
