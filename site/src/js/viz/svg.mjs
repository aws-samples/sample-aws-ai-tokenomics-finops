/**
 * Minimal SVG helpers.
 *
 * SVG elements are namespaced, so `document.createElement('rect')` silently produces an inert HTML
 * element that never renders. Everything here goes through `createElementNS`.
 *
 * Geometry is set as ATTRIBUTES (`width`, `x`, `rx`), never as a style attribute: the site serves under
 * `style-src 'self'` with no `'unsafe-inline'`, so a style attribute would be blocked at runtime.
 * Presentation (fill, stroke) is left to CSS classes so light and dark themes and print all inherit
 * from the same tokens rather than being hard-coded here.
 */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element with attributes.
 * @param {string} name tag name, e.g. 'rect'
 * @param {Object<string,string|number>} [attrs] attribute map; null/undefined values are skipped
 * @param {Node[]} [children]
 */
export function svg(name, attrs, children) {
  const el = document.createElementNS(NS, name);
  if (attrs) {
    for (const k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      const v = attrs[k];
      if (v === null || v === undefined) continue;
      el.setAttribute(k, String(v));
    }
  }
  if (children) for (let i = 0; i < children.length; i++) if (children[i]) el.appendChild(children[i]);
  return el;
}

/** An HTML element with a class and optional text. Convenience for the bits around a chart. */
export function el(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = String(text);
  return node;
}

/** Remove every child of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}
