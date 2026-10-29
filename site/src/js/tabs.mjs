/**
 * Three static-safe assessment routes: all tracks, Track 1, and Track 2.
 *
 * The canonical document stays complete in the DOM. `data-scope` only decides which route is rendered,
 * so JavaScript-off readers still receive one continuous document and historic fragments keep resolving.
 */

import { el, clear } from './viz/svg.mjs';
import { buildModel } from './model.mjs';

const STORE = 'tokenomics-scope-v1';
export const OVERVIEW_SCOPE = 'overview';
const LANDING_ID = 'tracks';

let model = null;
let currentScope = OVERVIEW_SCOPE;
let observer = null;

export function scope() {
  return currentScope;
}

function readStored() {
  try { return localStorage.getItem(STORE) || null; } catch (e) { return null; }
}
function writeStored(key) {
  try { localStorage.setItem(STORE, key); } catch (e) { /* private mode */ }
}

function routeOrder() {
  const tracks = (model || []).map((t) => ({ key: t.key, label: t.num, sub: t.name, anchor: t.sectionId }));
  return [{ key: OVERVIEW_SCOPE, label: 'All tracks', sub: 'choose your assessment', anchor: LANDING_ID }, ...tracks];
}

function ownersOf(node) {
  const owner = node && node.closest && node.closest('[data-tab]');
  return owner ? (owner.getAttribute('data-tab') || '').trim().split(/\s+/).filter(Boolean) : [];
}

/** Return the route owning an id, preferring the route already in view for shared sections. */
export function tabOf(id) {
  if (!id) return null;
  let node = null;
  try { node = document.getElementById(id); } catch (e) { return null; }
  if (!node) return null;
  const owners = ownersOf(node);
  if (!owners.length) return null;
  if (owners.includes(currentScope)) return currentScope;
  const stored = readStored();
  if (stored && owners.includes(stored)) return stored;
  return owners[0];
}

let navigationSerial = 0;
const APPLICATION_HASHES = new Set(['profile', 'my-issues', 'admin-issues']);

function decodeFragment(raw) {
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

function isRendered(target) {
  return !!target && (target.checkVisibility ? target.checkVisibility() : target.offsetParent !== null);
}

function navigationTarget(id) {
  if (id === LANDING_ID) return document.querySelector('[data-route-focus="tracks"]');
  return id ? document.getElementById(id) : null;
}

function focusTarget(target) {
  if (!isRendered(target)) return false;
  if (!target.matches('a,button,input,textarea,select,[tabindex]')) target.setAttribute('tabindex', '-1');
  try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  return document.activeElement === target;
}

export function setScope(key, opts) {
  const options = opts || {};
  const legal = routeOrder().map((route) => route.key);
  const next = legal.includes(key) ? key : OVERVIEW_SCOPE;
  const changed = next !== currentScope;
  currentScope = next;
  document.documentElement.setAttribute('data-scope', next);
  document.documentElement.setAttribute('data-route', next === OVERVIEW_SCOPE ? 'tracks' : next);
  if (options.persist !== false) writeStored(next);
  renderRoutes();
  measureRouteOffset();
  window.dispatchEvent(new Event('resize'));
  document.dispatchEvent(new CustomEvent('runbook:scope', { detail: { scope: next, changed } }));
}

function tagDynamicSurfaces() {
  const main = document.querySelector('main.content');
  if (!main) return;
  for (const node of [...main.children]) {
    if (node.tagName === 'SECTION' && !node.hasAttribute('data-tab')) {
      node.setAttribute('data-tab', 'overview t1 t2');
    }
  }
}

function renderRoutes() {
  const mount = document.getElementById('tabbar');
  if (!mount || !model) return;
  clear(mount);
  routeOrder().forEach((route) => {
    const a = el('a', 'tab tab-' + route.key);
    a.href = '#' + route.anchor;
    a.setAttribute('data-route-link', route.key);
    if (route.key === currentScope) a.setAttribute('aria-current', 'page');
    a.appendChild(el('span', 'tab-lead', route.label));
    a.appendChild(el('span', 'tab-sub', route.sub));
    mount.appendChild(a);
  });
}

function measureRouteOffset() {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  const pinned = parseFloat(getComputedStyle(bar).top);
  const routeBottom = (Number.isFinite(pinned) ? pinned : 56) + bar.offsetHeight;
  document.documentElement.style.setProperty('--sticky-1', routeBottom + 'px');
  const breadcrumb = document.querySelector('.breadcrumb');
  const stickyBottom = routeBottom + (breadcrumb ? breadcrumb.offsetHeight : 40);
  document.documentElement.style.setProperty('--sticky-2', stickyBottom + 'px');
  document.documentElement.style.setProperty('--anchor-offset', (stickyBottom + 16) + 'px');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Wait for route visibility, responsive wrapping and the measured sticky stack to stop moving. */
async function waitForRouteLayout(target, serial) {
  let previous = null;
  let stableFrames = 0;
  for (let frame = 0; frame < 12; frame++) {
    await nextFrame();
    if (serial !== navigationSerial) return false;
    measureRouteOffset();
    const rect = target.getBoundingClientRect();
    const sample = [
      rect.top,
      rect.height,
      document.documentElement.scrollHeight,
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anchor-offset')) || 0
    ];
    const stable = previous && sample.every((value, index) => Math.abs(value - previous[index]) <= 0.5);
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = sample;
    if (stableFrames >= 1) return true;
  }
  return serial === navigationSerial;
}

async function waitForScrollSettle(target, serial) {
  let previous = null;
  let stableFrames = 0;
  for (let frame = 0; frame < 120; frame++) {
    await nextFrame();
    if (serial !== navigationSerial) return false;
    const sample = [window.scrollY, target.getBoundingClientRect().top];
    const stable = previous && sample.every((value, index) => Math.abs(value - previous[index]) <= 0.5);
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = sample;
    // Four stable frames avoids treating the first delayed frame of a smooth scroll as completion.
    if (frame >= 4 && stableFrames >= 3) return true;
  }
  return serial === navigationSerial;
}

function targetIsAligned(target) {
  const rect = target.getBoundingClientRect();
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const intersects = rect.bottom > 0 && rect.top < window.innerHeight;
  const clampedAtDocumentEnd = Math.abs(window.scrollY - maxScroll) <= 2
    && rect.top > margin + 2 && intersects;
  return (intersects && Math.abs(rect.top - margin) <= 2) || clampedAtDocumentEnd;
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** The single owner for every document-fragment transition: reveal, settle, scroll, then focus. */
async function navigateFragment(id, opts) {
  const options = opts || {};
  const anchor = id && document.getElementById(id);
  const target = navigationTarget(id);
  if (!anchor || !target) return false;
  const serial = ++navigationSerial;
  const owner = tabOf(id);
  if (owner && owner !== currentScope) setScope(owner, { persist: options.persist !== false });
  else measureRouteOffset();

  const disclosure = target.closest && target.closest('details');
  if (disclosure && !disclosure.open) disclosure.open = true;
  if (!(await waitForRouteLayout(target, serial))) return false;

  const scrollOptions = {
    block: 'start',
    inline: 'nearest',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  };
  // The scroll itself can change the breadcrumb label and make it wrap on mobile, which changes the sticky
  // stack. Re-measure after the first landing and correct once if that new layout moved the target.
  for (let attempt = 0; attempt < 2; attempt++) {
    target.scrollIntoView(scrollOptions);
    if (!(await waitForScrollSettle(target, serial))) return false;
    if (!(await waitForRouteLayout(target, serial))) return false;
    if (targetIsAligned(target)) break;
  }
  if (serial !== navigationSerial) return false;
  focusTarget(target);
  return true;
}

function fragmentFromLocation() {
  return decodeFragment((location.hash || '').slice(1));
}

export function initTabs() {
  model = buildModel();
  if (!model.length) return;

  tagDynamicSurfaces();
  if (window.MutationObserver) {
    observer = new MutationObserver(tagDynamicSurfaces);
    const main = document.querySelector('main.content');
    if (main) observer.observe(main, { childList: true });
  }

  // History must not restore an old scroll position after this module has resolved a different visible route.
  try { history.scrollRestoration = 'manual'; } catch (e) { /* unsupported history implementation */ }

  const requested = fragmentFromLocation();
  const hasDocumentTarget = !!(requested && document.getElementById(requested));
  // Application-owned hashes (the profile panel and its historic aliases) are not document fragments.
  const fallbackToChooser = !!requested && !hasDocumentTarget && !APPLICATION_HASHES.has(requested);
  const navigationId = hasDocumentTarget ? requested : (fallbackToChooser ? LANDING_ID : '');
  const fromHash = tabOf(navigationId);
  const stored = readStored();
  const legal = routeOrder().map((route) => route.key);
  const initial = fromHash || (legal.includes(stored) ? stored : OVERVIEW_SCOPE);
  setScope(initial, { persist: !fromHash });
  if (navigationId) void navigateFragment(navigationId, { persist: false });

  // Bubble after element handlers so controls such as the sidebar disclosure caret can cancel their click.
  // Preventing the real link default removes the browser's competing native fragment scroll; pushState keeps
  // valid deep-link history, and the one pipeline above performs the visible transition exactly once.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target && event.target.closest && event.target.closest('a[href^="#"]');
    if (!a || (a.target && a.target !== '_self')) return;
    const href = a.getAttribute('href') || '';
    const id = decodeFragment(href.slice(1));
    if (!id || !document.getElementById(id)) return;
    event.preventDefault();
    if (location.hash !== href) history.pushState(null, '', href);
    void navigateFragment(id);
  });

  // Hash history and external location.hash assignments both arrive here. Link activation does not, because
  // pushState plus the direct call above deliberately avoids a second hashchange/native-scroll path.
  window.addEventListener('hashchange', () => {
    const id = fragmentFromLocation();
    if (id && document.getElementById(id)) void navigateFragment(id);
  });

  window.addEventListener('resize', measureRouteOffset, { passive: true });
}
