// node --test scripts/lib/contrast.test.mjs  (run by `npm run verify:deck`)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, ratio, contrastFindings } from './contrast.mjs';

test('WCAG reference ratios', () => {
  assert.equal(ratio([255, 255, 255], [0, 0, 0]).toFixed(1), '21.0');
  assert.equal(ratio([118, 118, 118], [255, 255, 255]).toFixed(2), '4.54'); // #767676 on white
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('rgba(255,255,255,0.12)'), [255, 255, 255, 0.12]);
  assert.equal(parseColor('transparent'), null);
  assert.equal(parseColor('hsl(0,0%,0%)'), undefined);
});

const deck = (fill, color = '#F2F2F4', fontSize = 18, extra = {}) => ({
  theme: { background: '#0E0F12', color: '#F2F2F4' },
  slides: [{ id: 's', background: extra.background || '#0E0F12', elements: [
    { id: 'box', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill },
    ...(extra.image ? [{ id: 'img', type: 'image', x: 0, y: 0, w: 100, h: 100 }] : []),
    { id: 't', type: 'text', x: 10, y: 10, w: 80, h: 80, html: 'words', color, fontSize }
  ] }]
});

test('light text on a white box fails; on the dark card it passes', () => {
  assert.match(contrastFindings(deck('#FFFFFF')).findings[0], /^s\/t 1\.12:1 < 4\.5:1$/);
  assert.deepEqual(contrastFindings(deck('#16181D')).findings, []);
});

test('large text needs 3:1, body text 4.5:1', () => {
  // #6B7080 on #0E0F12 is about 3.7:1: fails as 18 px body text, passes at 24 px.
  assert.equal(contrastFindings(deck(null, '#6B7080', 18)).findings.length, 1);
  assert.equal(contrastFindings(deck(null, '#6B7080', 24)).findings.length, 0);
});

test('a gradient is judged where the text sits; text on an image is never assumed fine', () => {
  // 90deg runs left (black) to right (white) across 1280 px. The box spans x 0..100, all near-black:
  // light text passes there. Moved to the right edge, the same text sits on near-white and fails.
  const g = 'linear-gradient(90deg, #000000 0%, #FFFFFF 100%)';
  assert.equal(contrastFindings(deck(null, '#F2F2F4', 18, { background: g })).findings.length, 0);
  const right = deck(null, '#F2F2F4', 18, { background: g });
  right.slides[0].elements[1].x = 1180;
  assert.equal(contrastFindings(right).findings.length, 1);
  assert.match(contrastFindings(deck(null, '#F2F2F4', 18, { background: 'radial-gradient(#000, #fff)' })).findings[0],
    /cannot read/);
  assert.match(contrastFindings(deck(null, '#F2F2F4', 18, { image: true })).findings[0], /sits on an image/);
});
