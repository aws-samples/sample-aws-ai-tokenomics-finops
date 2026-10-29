/**
 * "Suggest a change": a per-section link to a prefilled GitHub issue form.
 *
 * This replaces the old in-page feedback service. The static site has no backend, no sign-in and no
 * network calls of its own, so a correction is filed where the content lives: as an issue on the
 * GitHub repository, through the `content-correction.yml` issue form, with the section's title and
 * anchor already filled in so the maintainer can find the exact place on the page.
 *
 * What this module guarantees, and `npm run verify` asserts:
 *  - It makes NO request. It only builds `<a href>` elements; the browser navigates when, and only
 *    when, the reader clicks one, in a new tab.
 *  - It never touches `headingText()`'s input. The link goes AFTER the heading, never inside it, so the
 *    lever names the nav, breadcrumb, wayfinder and report read stay exactly what they were.
 *  - It runs LAST in main.mjs and is purely additive: if it throws, the runbook still works.
 *  - Nothing it adds is printed (see 92-suggest.css and 95-print.css).
 */

import { headingText } from './model.mjs';

export const REPO_URL = 'https://github.com/aws-samples/sample-aws-ai-tokenomics-finops';
export const ISSUE_TEMPLATE = 'content-correction.yml';

/**
 * The issue-form URL for one section.
 * GitHub issue forms prefill a field from a query parameter named after the field's `id`, so
 * `section` lands in the form's section field and `title` in the issue title.
 * @param {string} title   human-readable section title
 * @param {string} anchor  the section's id, without '#'
 */
export function suggestUrl(title, anchor) {
  const params = new URLSearchParams();
  params.set('template', ISSUE_TEMPLATE);
  params.set('title', 'Content correction: ' + title);
  params.set('section', anchor ? title + ' (#' + anchor + ')' : title);
  return REPO_URL + '/issues/new?' + params.toString();
}

function link(text, title, anchor, ariaLabel) {
  const a = document.createElement('a');
  a.className = 'suggest-link';
  a.href = suggestUrl(title, anchor);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  if (ariaLabel) a.setAttribute('aria-label', ariaLabel);
  return a;
}

/**
 * One link under every lever, checklist and principle heading (`main.content h4[id]`), plus one in the
 * page footer for anything else.
 * @returns {number} how many per-section links were added
 */
export function initSuggestLinks() {
  let added = 0;
  document.querySelectorAll('main.content h4[id]').forEach((heading) => {
    const next = heading.nextElementSibling;
    if (next && next.classList.contains('suggest-change')) return; // idempotent
    const title = headingText(heading);
    if (!title) return;
    const bar = document.createElement('p');
    bar.className = 'suggest-change';
    // The visible label is the same on every lever, so the accessible name carries which one it is.
    bar.appendChild(link('Suggest a change', title, heading.id, 'Suggest a change to: ' + title + ' (opens GitHub in a new tab)'));
    heading.insertAdjacentElement('afterend', bar);
    added += 1;
  });

  const footer = document.querySelector('main.content footer.page');
  if (footer && !footer.querySelector('.suggest-footer')) {
    const line = document.createElement('p');
    line.className = 'suggest-footer';
    line.appendChild(document.createTextNode('Something wrong on this page? '));
    line.appendChild(link('Suggest a change', 'General', '', 'Suggest a change to this runbook (opens GitHub in a new tab)'));
    footer.appendChild(line);
  }
  return added;
}
