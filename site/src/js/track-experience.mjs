/** Track-scoped references and route-level progressive enhancements. */
import { scope } from './tabs.mjs';

const TRACKS = {
  t1: { section: 'track-1', label: 'Track 1' },
  t2: { section: 'track-2', label: 'Track 2' }
};

let referencesByTrack = {};
let latestCoverage = {};

const SCOPES = {
  t1: ['t1-model-inference', 't1-agent-harness', 't1-end-user'],
  t2: ['model-inference', 'agent-harness', 'end-user']
};

function renderTrackCards() {
  document.querySelectorAll('[data-track-card]').forEach((card) => {
    const key = card.getAttribute('data-track-card');
    const section = document.getElementById(TRACKS[key].section);
    const totals = { answered: 0, total: 0, gaps: 0 };
    SCOPES[key].forEach((scopeKey) => {
      const value = latestCoverage[scopeKey];
      if (!value) return;
      totals.answered += value.c.answered;
      totals.total += value.c.total;
      totals.gaps += value.gaps;
    });
    if (!totals.total && section) totals.total = section.querySelectorAll('[data-assess-q]').length;
    const levers = section ? section.querySelectorAll('h4[id]').length : 0;
    const refs = referencesByTrack[key] ? referencesByTrack[key].size : 0;
    const pct = totals.total ? Math.round((totals.answered / totals.total) * 100) : 0;
    const meta = card.querySelector('[data-track-card-meta]');
    const status = card.querySelector('[data-track-card-status]');
    const action = card.querySelector('[data-track-card-action]');
    const bar = card.querySelector('[data-track-card-progressbar]');
    const fill = card.querySelector('[data-track-card-progress]');
    if (meta) meta.textContent = levers + ' levers · ' + totals.total + ' questions · ' + refs + ' references';
    if (status) status.textContent = totals.answered + '/' + totals.total + ' answered' + (totals.gaps ? ' · ' + totals.gaps + ' gaps' : '');
    if (action) action.textContent = totals.answered ? 'Continue assessment →' : 'Start assessment →';
    if (bar) {
      bar.setAttribute('aria-valuemax', String(totals.total));
      bar.setAttribute('aria-valuenow', String(totals.answered));
      bar.setAttribute('aria-valuetext', totals.answered + ' of ' + totals.total + ' questions answered');
    }
    if (fill) fill.style.width = pct + '%';
  });
}

function collectReferences() {
  referencesByTrack = {};
  Object.entries(TRACKS).forEach(([key, config]) => {
    const section = document.getElementById(config.section);
    referencesByTrack[key] = new Set(
      [...(section ? section.querySelectorAll('a[href^="#ref-"]') : [])]
        .map((a) => (a.getAttribute('href') || '').slice(1))
        .filter(Boolean)
    );
  });

  document.querySelectorAll('#references li[id^="ref-"]').forEach((item) => {
    const tracks = Object.keys(TRACKS).filter((key) => referencesByTrack[key].has(item.id));
    item.setAttribute('data-reference-tracks', tracks.join(' '));
  });
}

function renderReferences() {
  const key = scope();
  const note = document.querySelector('[data-reference-note]');
  const summary = document.querySelector('[data-reference-summary]');
  const items = [...document.querySelectorAll('#references li[id^="ref-"]')];
  const track = TRACKS[key];

  if (!track) {
    items.forEach((item) => { item.hidden = false; });
    if (note) note.textContent = items.length + ' references support the complete runbook. Choose a track to see only the sources used by that assessment.';
    if (summary) summary.textContent = 'Show all ' + items.length + ' references';
    return;
  }

  const used = referencesByTrack[key] || new Set();
  items.forEach((item) => { item.hidden = !used.has(item.id); });
  if (note) note.textContent = used.size + ' references are cited by ' + track.label + '. Sources used only by the other assessment are excluded from this view.';
  if (summary) summary.textContent = 'Show ' + track.label + ' references (' + used.size + ')';
}

export function initTrackExperience() {
  collectReferences();
  renderReferences();
  renderTrackCards();
  document.addEventListener('runbook:scope', renderReferences);
  document.addEventListener('runbook:coverage', (event) => {
    latestCoverage = (event.detail && event.detail.byScope) || {};
    renderTrackCards();
  });

  const shared = document.querySelector('details.landing-library');
  if (shared) shared.addEventListener('toggle', () => {
    if (shared.open) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
}
