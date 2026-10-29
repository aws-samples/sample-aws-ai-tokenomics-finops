/**
 * Opens a collapsed <details> when the URL hash points inside it.
 *
 * Extracted verbatim from the runbook's original single inline script block, lines 452-462 of the block.
 */
export function initHashDetails() {
  // open the collapsed narrative when a hash points inside it
  function openTargetDetails() {
    var id = location.hash.slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    // Every enclosing collapse, not just the nearest: a Read more block sits inside a gap panel, and a
    // hash pointing into it must open both or the target stays off screen.
    var d = el.closest('details');
    while (d) {
      d.open = true;
      d = d.parentElement ? d.parentElement.closest('details') : null;
    }
  }
  window.addEventListener('hashchange', openTargetDetails);
  openTargetDetails();
}
