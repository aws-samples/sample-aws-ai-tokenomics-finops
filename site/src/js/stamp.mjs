/**
 * The date line on an exported assessment report.
 *
 * The site is static (GitHub Pages, or the self-contained file opened from disk) and has no sign-in,
 * so there is no reader identity to attribute a report to. The report is dated instead, which keeps a
 * shared copy anchored in time: prices and features in the runbook are dated, so a report must be too.
 *
 * Never read identity from the page, a cookie or a query string here. A report header is copied into
 * other documents, and an attribution the page cannot verify is worse than none.
 */

/**
 * A single line saying when an assessment was run, for the exported report.
 * @param {Date} [now]
 * @returns {string}
 */
export function assessorLine(now) {
  const when = (now || new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return 'Assessed on ' + when;
}
