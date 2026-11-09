/**
 * WCAG 2.x contrast for the presenter deck's text, computed from the Bento document alone.
 *
 * For each text element with visible words, the background is what is painted under the centre of its
 * box: the slide background, then every earlier rect/ellipse shape whose box contains that point,
 * composited in paint order (array order = z order). Text colour is composited over that background
 * too, so an rgba() colour is judged as rendered. The bar is 4.5:1, or 3:1 for large text: >= 24 px,
 * or >= 18.66 px (14 pt) at weight >= 700.
 *
 * Exact, not lenient, where it cannot measure:
 *   - a linear-gradient background is sampled under the box's corners and centre, and the WORST sample
 *     counts; any other gradient form is a finding;
 *   - text whose centre sits over an image or svg element is a finding (its pixels are not known here);
 *   - a colour it cannot parse is a finding.
 * shortcut: one sample point per text box, not per glyph; good enough for card layouts. Upgrade to a
 * rendered-pixel check if text ever straddles two fills.
 */

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

/** '#rgb', '#rrggbb', '#rrggbbaa', 'rgb()/rgba()', 'white', 'black' -> [r,g,b,a]; transparent -> null. */
export function parseColor(input) {
  const c = String(input ?? '').trim().toLowerCase();
  if (c === '' || c === 'transparent' || c === 'none') return null;
  if (NAMED[c]) return NAMED[c];
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return undefined;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = c.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return undefined;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return undefined; // unknown format
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

function luminance([r, g, b]) {
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two opaque colours. */
export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The background colours under a text box. A solid colour is one value. A `linear-gradient(<deg>, <colour>
 * <pct>, ...)` is sampled at the box's four corners and centre, with CSS's own geometry: the gradient line
 * runs through the slide centre at the given angle, with length |w sin a| + |h cos a|. Any other gradient
 * form returns `undefined` (a finding), never a guess.
 */
function backgroundAt(value, size, box) {
  const v = String(value ?? '');
  if (!/gradient\(/i.test(v)) return [parseColor(v)];
  const m = v.match(/^linear-gradient\(\s*(-?[\d.]+)deg\s*,(.*)\)$/i);
  if (!m) return [undefined];
  const stops = [...m[2].matchAll(/(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s+(-?[\d.]+)%/gi)]
    .map((x) => ({ c: parseColor(x[1]), at: Number(x[2]) / 100 }));
  if (stops.length < 2 || stops.some((s) => !s.c)) return [undefined];
  const a = (Number(m[1]) * Math.PI) / 180;
  const { width: W, height: H } = size;
  const len = Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a));
  const colourAt = (x, y) => {
    const t = ((x - W / 2) * Math.sin(a) - (y - H / 2) * Math.cos(a)) / len + 0.5;
    if (t <= stops[0].at) return stops[0].c;
    const j = stops.findIndex((s) => s.at >= t);
    if (j === -1) return stops[stops.length - 1].c;
    const [p, q] = [stops[j - 1], stops[j]];
    const f = (t - p.at) / (q.at - p.at || 1);
    return [0, 1, 2].map((i) => p.c[i] + (q.c[i] - p.c[i]) * f).concat(1);
  };
  const { x, y, w, h } = box;
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]].map(([px, py]) => colourAt(px, py));
}

const visibleText = (html) => String(html ?? '').replace(/<[^>]+>|\{\{[^}]*\}\}|&nbsp;/g, '').trim();

/** All text elements below the WCAG bar, as "slide/element ratio<need" strings, plus how many were checked. */
export function contrastFindings(doc) {
  const findings = [];
  let checked = 0;
  const theme = doc.theme || {};
  const size = doc.size || { width: 1280, height: 720 };
  for (const slide of doc.slides || []) {
    const els = slide.elements || [];
    els.forEach((e, k) => {
      if (e.type !== 'text' || !visibleText(e.html)) return;
      checked++;
      const where = `${slide.id}/${e.id}`;
      const stops = backgroundAt(slide.background || theme.background, size, e);
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const under = els.slice(0, k).filter((u) => u.x <= cx && cx <= u.x + u.w && u.y <= cy && cy <= u.y + u.h);
      if (under.some((u) => u.type === 'image' || u.type === 'svg')) {
        findings.push(`${where} sits on an image (contrast unknown)`);
        return;
      }
      const fills = under.filter((u) => u.type === 'shape' && (u.shape === 'rect' || u.shape === 'ellipse'))
        .map((u) => parseColor(u.fill));
      const fg = parseColor(e.color || theme.color);
      if ([fg, ...stops, ...fills].some((c) => c === undefined) || !fg || stops.some((c) => !c)) {
        findings.push(`${where} has a colour this check cannot read`);
        return;
      }
      const large = (e.fontSize || 0) >= 24 || ((e.fontWeight || 400) >= 700 && (e.fontSize || 0) >= 18.66);
      const need = large ? 3 : 4.5;
      const worst = Math.min(...stops.map((stop) => {
        const bg = fills.reduce((acc, f) => (f ? over(f, acc) : acc), [...stop.slice(0, 3), 1]);
        return ratio(over(fg, bg), bg);
      }));
      if (worst < need) findings.push(`${where} ${worst.toFixed(2)}:1 < ${need}:1`);
    });
  }
  return { findings, checked };
}
