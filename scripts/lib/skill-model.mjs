/**
 * Read the runbook's self-assessment out of content/index.html: tracks, layers, levers, questions,
 * answer options, "What it saves" lines and each lever's citations.
 *
 * build-skill.mjs renders this model into the agent skill's reference files, and verify-skill.mjs
 * re-renders it and diffs the committed files, so the skill cannot drift from the runbook. Nothing in
 * the skill's references is hand-copied.
 *
 * A lever's region follows the same rule as site/src/js/scope.mjs: the lever's <h4> and its following
 * siblings up to the next h4[id], h3, figure, .assess-report or scope picker.
 */

import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

/**
 * Where each answer's evidence came from. Level 1 (static review) emits only EMIT; RESERVED names the
 * sources planned for later levels, so a report schema that already carries the tag needs no change.
 * `none` is not a source: it marks an Unknown answer, where nothing was found and the user did not say.
 */
export const EVIDENCE_SOURCES = {
  emit: ['code', 'config', 'iac', 'docs', 'user'],
  reserved: ['session-logs', 'aws-metrics'],
  unknown: 'none'
};

const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value;
const hasClass = (n, c) => (attr(n, 'class') || '').split(/\s+/).includes(c);
const isEl = (n) => !!n.tagName;

function walk(n, fn) {
  fn(n);
  for (const c of n.childNodes || []) walk(c, fn);
  if (n.content) walk(n.content, fn);
}
function all(root, pred) {
  const out = [];
  walk(root, (n) => { if (isEl(n) && pred(n)) out.push(n); });
  return out;
}
const first = (root, pred) => all(root, pred)[0];

/** Text content with whitespace collapsed, the way a reader sees it. */
export function text(n) {
  let s = '';
  walk(n, (c) => { if (c.nodeName === '#text') s += c.value; });
  return s.replace(/\s+/g, ' ').trim();
}

/** Lever region: the h4 and its element siblings up to the next lever boundary (mirrors scope.mjs). */
function leverRegion(h4) {
  const sibs = h4.parentNode.childNodes.filter(isEl);
  const out = [];
  for (let i = sibs.indexOf(h4); i < sibs.length; i++) {
    const n = sibs[i];
    if (n !== h4 && ((n.tagName === 'h4' && attr(n, 'id')) || n.tagName === 'h3' || n.tagName === 'figure'
      || hasClass(n, 'assess-report') || attr(n, 'data-scope-picker') !== undefined)) break;
    out.push(n);
  }
  return out;
}

/** The nearest h3.layer before the lever's h4, among its siblings. */
function layerOf(h4) {
  const sibs = h4.parentNode.childNodes.filter(isEl);
  for (let i = sibs.indexOf(h4); i >= 0; i--) if (sibs[i].tagName === 'h3' && hasClass(sibs[i], 'layer')) return sibs[i];
  return null;
}

export function loadModel(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const doc = parse(html);
  const byId = new Map();
  walk(doc, (n) => { if (isEl(n) && attr(n, 'id')) byId.set(attr(n, 'id'), n); });

  // The answer scale, read from the buttons; every question must carry the same one.
  let options = null;

  // References: "[N] Title. Source." + URL.
  const refs = new Map();
  for (const li of all(byId.get('references') || doc, (n) => n.tagName === 'li' && /^ref-\d+$/.test(attr(n, 'id') || ''))) {
    const a = first(li, (n) => n.tagName === 'a' && attr(n, 'href'));
    refs.set(attr(li, 'id'), { n: Number(attr(li, 'id').slice(4)), title: text(li).replace(a ? text(a) : '', '').trim(), url: a ? attr(a, 'href') : '' });
  }

  const tracks = [];
  for (const sec of all(doc, (n) => n.tagName === 'section' && hasClass(n, 'track-route'))) {
    const track = { id: attr(sec, 'id'), title: text(first(sec, (n) => n.tagName === 'h2')), levers: [] };
    const scoped = new Set(all(sec, (n) => attr(n, 'data-scope-lever') !== undefined && n.tagName === 'input').map((n) => attr(n, 'data-scope-lever')));
    for (const box of all(sec, (n) => n.tagName === 'div' && hasClass(n, 'assess') && attr(n, 'data-assess-lever'))) {
      const qs = all(box, (n) => attr(n, 'data-assess-q') !== undefined);
      const anchor = attr(qs[0], 'data-anchor');
      const h4 = byId.get(anchor);
      if (!h4 || h4.tagName !== 'h4') throw new Error(`lever "${attr(box, 'data-assess-lever')}": no <h4 id="${anchor}">`);
      const region = leverRegion(h4);
      if (!region.includes(box)) throw new Error(`lever "${anchor}": its assessment block is outside the lever region`);
      const savesEl = region.find((n) => n.tagName === 'p' && hasClass(n, 'saves'));
      const refIds = [];
      for (const n of region) for (const a of all(n, (x) => x.tagName === 'a' && /^#ref-\d+$/.test(attr(x, 'href') || ''))) {
        const id = attr(a, 'href').slice(1);
        if (!refIds.includes(id)) refIds.push(id);
      }
      const layer = layerOf(h4);
      track.levers.push({
        anchor,
        name: attr(box, 'data-assess-lever'),
        layer: layer ? text(layer) : '',
        scopable: scoped.has(anchor),
        saves: savesEl ? text(savesEl).replace(/^What it saves:\s*/, '') : '',
        citations: refIds.map((id) => {
          const r = refs.get(id);
          if (!r) throw new Error(`lever "${anchor}" cites #${id}, which is not in the reference list`);
          return r;
        }),
        questions: qs.map((q) => {
          const opts = all(q, (n) => n.tagName === 'button' && attr(n, 'data-v')).map((b) => ({ v: attr(b, 'data-v'), label: text(b) }));
          const sig = JSON.stringify(opts);
          if (options === null) options = opts;
          // shortcut: one answer scale for every question; if a question ever gets its own, emit options per question.
          else if (sig !== JSON.stringify(options)) throw new Error(`question ${attr(q, 'data-key')} has a different answer scale: ${sig}`);
          const lead = first(q, (n) => hasClass(n, 'gap-lead'));
          return {
            key: attr(q, 'data-key'),
            qid: text(first(q, (n) => hasClass(n, 'qid'))),
            text: text(first(q, (n) => hasClass(n, 'assess-qtext'))).replace(/^Q\d+\s*/, ''),
            // The bold run-in label ("Best practice." / "The short answer.") is page furniture, not guidance.
            bestPractice: lead ? text(lead).replace(/^(?:Best practice|The short answer)\.\s*/, '') : ''
          };
        })
      });
    }
    tracks.push(track);
  }

  const one = (cls) => {
    const els = all(doc, (n) => hasClass(n, cls));
    const texts = [...new Set(els.map(text))];
    if (texts.length !== 1) throw new Error(`expected one distinct .${cls} text, found ${texts.length}`);
    return texts[0];
  };
  return {
    tracks,
    options,
    cta: one('track-gap-cta'),
    disclaimer: one('beta-note').replace(/\s*To suggest a correction.*$/, '')
  };
}
