/**
 * Sidebar drawer, collapsible nav groups, filter, scroll-spy, breadcrumb, back-to-top.
 *
 * Extracted verbatim from the runbook's original single inline script block, lines 23-182 of the block.
 */
/**
 * A nav link's own label, without the decorations hung off it.
 *
 * The breadcrumb takes its section name from the matching nav link, so anything else inside that link ends
 * up in the breadcrumb: the "shared" pill produced "Manage session and context shared", and the cost map
 * link's second line produced "Cost structure mapall 34 levers, and your progress". Skipping the elements
 * is more robust than stripping their text afterwards, because it survives a change of wording.
 */
function navLabel(a) {
  var out = '';
  Array.prototype.forEach.call(a.childNodes, function (child) {
    if (child.nodeType === 3) { out += child.nodeValue; return; }
    if (child.nodeType !== 1) return;
    if (child.classList.contains('pill-s')) return;      // the "shared" pill
    if (child.classList.contains('nav-map-sub')) return; // the cost map link's second line
    if (child.classList.contains('nav-caret')) return;   // the collapse affordance
    out += child.textContent;
  });
  return out.replace(/\s+/g, ' ').trim();
}

export function initNav() {
  // mobile drawer
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var navToggle = document.getElementById('navToggle');
  function closeNav() { sidebar.classList.remove('open'); scrim.classList.remove('show'); navToggle.setAttribute('aria-expanded', 'false'); }
  navToggle.addEventListener('click', function () {
    var open = sidebar.classList.toggle('open');
    scrim.classList.toggle('show', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  scrim.addEventListener('click', closeNav);
  sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });

  // collapsible nav groups: any header link followed by sub-links becomes a
  // group that is collapsed by default, so the rail reads as a short list of
  // layers. Building this from the flat <ul> keeps the markup simple.
  var navGroupFor = {}; // sub-link id -> head <a>
  var headToItems = []; // { head: <a>, items: [<li>...] }
  sidebar.querySelectorAll('ul').forEach(function (ul) {
    var lis = Array.prototype.slice.call(ul.children);
    for (var i = 0; i < lis.length; i++) {
      var link = lis[i].querySelector('a.nav-link');
      if (!link) continue;
      // a head is a non-sub link immediately followed by one or more sub links
      if (link.classList.contains('lvl-sub')) continue;
      var group = [];
      for (var j = i + 1; j < lis.length; j++) {
        var next = lis[j].querySelector('a.nav-link');
        if (!next || !next.classList.contains('lvl-sub')) break;
        group.push(lis[j]);
      }
      if (!group.length) continue;
      lis[i].classList.add('nav-head');
      var caret = document.createElement('span');
      caret.className = 'nav-caret'; caret.setAttribute('aria-hidden', 'true');
      caret.textContent = '▶'; // ►
      link.insertBefore(caret, link.firstChild);
      link.setAttribute('aria-expanded', 'false');
      var entry = { head: link, items: group };
      headToItems.push(entry);
      group.forEach(function (li) {
        li.classList.add('nav-collapsed');
        var sub = li.querySelector('a.nav-link');
        if (sub) navGroupFor[sub.getAttribute('href').slice(1)] = link;
      });
    }
  });
  function setGroup(headLink, expanded) {
    headLink.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    headToItems.forEach(function (e) {
      if (e.head !== headLink) return;
      e.items.forEach(function (li) { li.classList.toggle('nav-collapsed', !expanded); });
    });
  }
  // click the caret to toggle; click the label to navigate AND expand
  headToItems.forEach(function (e) {
    e.head.addEventListener('click', function (ev) {
      if (ev.target.closest('.nav-caret')) {
        ev.preventDefault();
        setGroup(e.head, e.head.getAttribute('aria-expanded') !== 'true');
      } else {
        setGroup(e.head, true);
      }
    });
  });
  // expand the group that owns a given id (used by scroll-spy so the active
  // lever is always visible even though its group starts collapsed)
  function expandGroupFor(id) {
    var head = navGroupFor[id];
    if (head && head.getAttribute('aria-expanded') !== 'true') setGroup(head, true);
    // a head that is itself the active target also expands
    for (var i = 0; i < headToItems.length; i++) {
      if (headToItems[i].head.getAttribute('href').slice(1) === id) {
        setGroup(headToItems[i].head, true); break;
      }
    }
  }

  // sidebar filter
  var filter = document.getElementById('navFilter');
  filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    // while filtering, reveal collapsed items so matches inside a closed group show
    sidebar.classList.toggle('js-filtering', !!q);
    sidebar.querySelectorAll('a.nav-link').forEach(function (a) {
      var hit = !q || a.textContent.toLowerCase().indexOf(q) !== -1;
      a.parentElement.style.display = hit ? '' : 'none';
    });
  });

  // hover/focus anchor affordances on every heading with an id
  document.querySelectorAll('main.content h2[id], main.content h3[id], main.content h4[id], main.content h5[id]').forEach(function (h) {
    var a = document.createElement('a');
    a.className = 'heading-anchor'; a.href = '#' + h.id; a.textContent = '#';
    a.setAttribute('aria-label', 'Link to this section');
    h.appendChild(a);
  });

  // scroll-spy across sidebar + rail
  var links = {};
  document.querySelectorAll('.sidebar a.nav-link, .rail a').forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    (links[id] = links[id] || []).push(a);
  });
  var targets = Object.keys(links).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var bcTrack = document.getElementById('bcTrack');
  var bcSection = document.getElementById('bcSection');
  var current = null;
  function setActive(id) {
    if (id === current) return;
    current = id;
    document.querySelectorAll('.sidebar a.active, .rail a.active').forEach(function (a) { a.classList.remove('active'); });
    if (typeof expandGroupFor === 'function') expandGroupFor(id);
    (links[id] || []).forEach(function (a) { a.classList.add('active'); });
    // breadcrumb
    var route = document.documentElement.getAttribute('data-scope');
    var track = route === 't1' ? 'Track 1 · AI coding assistant'
      : route === 't2' ? 'Track 2 · Purpose-built agentic AI application'
      : 'All tracks';
    bcTrack.textContent = track;
    var linkEl = (links[id] || [])[0];
    bcSection.textContent = linkEl ? navLabel(linkEl) : '';

    // Broadcast rather than call. The wayfinder needs to know where the reader is, and re-deriving that
    // would mean a second scroll-spy fighting this one. An event keeps the dependency one-way: nav knows
    // nothing about the wayfinder, and the wayfinder cannot break scroll-spy.
    document.dispatchEvent(new CustomEvent('runbook:active', { detail: { id: id } }));
  }
  // Document order, not the order the links happened to be found in. The rule below walks forwards and
  // keeps the last match, so it is only correct on a sorted list.
  targets.sort(function (a, b) {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  });

  /**
   * The heading the reader is currently under: the LAST target whose top has passed the line.
   *
   * The previous rule was "the topmost intersecting target", which cannot work here. `targets` includes
   * the two `<section>` wrappers, and `section#track-2` is thousands of pixels tall, so while you are
   * anywhere inside Track 2 its top is the highest on screen and it wins every time. The breadcrumb
   * therefore said "Overview & levers" for the whole track and never named the lever being read, and
   * anything downstream of the active id inherited that. Walking to the last heading above the line
   * prefers the most specific target instead, which is what a reader means by "where am I".
   */
  function activeLine() {
    var measured = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anchor-offset'));
    return Number.isFinite(measured) ? measured : 120;
  }

  /**
   * Is this target actually on screen?
   *
   * checkVisibility() walks ancestors; `getComputedStyle(el).display` does not, so a heading inside a hidden
   * PANE would read as visible on its own computed style. See the same trap in verify-runbook-dom.mjs.
   */
  function isRendered(el) {
    return el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null;
  }

  function pickActive() {
    var best = null;
    var first = null;
    var line = activeLine();
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      // A target in a pane that is not on screen is not somewhere the reader can be -- and it measures as a
      // zero-size box at the origin, so `top - LINE <= 0` is ALWAYS true for it. Before this skip, the last
      // hidden section in the document won every time: in the Cost map pane the four Reference sections sit
      // after the map and are hidden, so the breadcrumb read "Reference > References" while the reader was
      // looking at the board. `continue`, not `break`, because the panes are interleaved with the visible one.
      if (!isRendered(t)) continue;
      if (!first) first = t;
      if (t.getBoundingClientRect().top - line <= 0) best = t;
      else break;
    }
    // Above the first heading (at the very top of the pane) there is nothing to be under yet.
    return best || first || null;
  }

  function syncActive() {
    var best = pickActive();
    if (best) setActive(best.id);
  }

  // The observer is only a cheap "something moved" trigger now; the choice is pickActive's.
  var obs = new IntersectionObserver(syncActive, { rootMargin: '-110px 0px -70% 0px', threshold: 0 });
  targets.forEach(function (t) { obs.observe(t); });
  window.addEventListener('scroll', syncActive, { passive: true });
  // Switching pane changes which targets exist as far as pickActive is concerned, and the observer will not
  // fire for it: a hidden element never intersects, so nothing moved from its point of view. Without this the
  // breadcrumb keeps naming the section the reader was on in the pane they just left.
  document.addEventListener('runbook:scope', syncActive);
  syncActive();

  // back to top
  var toTop = document.getElementById('toTop');
  window.addEventListener('scroll', function () {
    toTop.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

}
