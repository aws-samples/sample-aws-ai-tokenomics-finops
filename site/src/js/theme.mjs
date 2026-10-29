/**
 * Colour theme: restore, toggle, persist, and follow the OS preference.
 *
 * Extracted verbatim from the runbook's original single inline script block, lines 3-22 of the block.
 */
export function initTheme() {
  var root = document.documentElement;
  // theme
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  var initial = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', initial);
  var tbtn = document.getElementById('themeToggle');
  var themeLabel = tbtn.querySelector('[data-theme-label]');
  var themeGlyph = tbtn.querySelector('[data-theme-glyph]');
  function paintTheme() {
    var d = root.getAttribute('data-theme') === 'dark';
    themeGlyph.textContent = d ? '☀' : '☽';
    themeLabel.textContent = d ? 'Light' : 'Dark';
    var label = d ? 'Switch to light theme' : 'Switch to dark theme';
    tbtn.setAttribute('aria-label', label);
    tbtn.setAttribute('title', label);
  }
  paintTheme();
  tbtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintTheme();
  });

}
