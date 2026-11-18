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

/**
 * The role filter. `ai-pm-leader` is the all-questions view and is never a tag; every question carries 1 to 3
 * of the others in `data-personas`, naming the roles that act on its answer. The ids and labels come from the
 * runbook's own persona pickers, so the site and the skill cannot disagree.
 */
export const ALL_PERSONA = 'ai-pm-leader';

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

  // The persona pickers: one per track, identical, the all-questions view first.
  const pickers = all(doc, (n) => attr(n, 'data-persona-picker') !== undefined);
  const personaSets = pickers.map((p) => all(p, (n) => n.tagName === 'input' && attr(n, 'type') === 'radio')
    .map((i) => ({ id: attr(i, 'value'), label: text(i.parentNode) })));
  if (!personaSets.length) throw new Error('no [data-persona-picker] in the runbook');
  if (personaSets.some((s) => JSON.stringify(s) !== JSON.stringify(personaSets[0]))) throw new Error('the persona pickers do not list the same personas');
  const personas = personaSets[0];
  if (personas[0]?.id !== ALL_PERSONA) throw new Error(`the first persona must be ${ALL_PERSONA}`);
  const tagIds = personas.slice(1).map((p) => p.id);

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
          const key = attr(q, 'data-key');
          const tags = (attr(q, 'data-personas') || '').trim().split(/\s+/).filter(Boolean);
          const bad = personaTagProblems(tags, tagIds);
          if (bad) throw new Error(`question ${key}: ${bad}`);
          return {
            key,
            personas: tags,
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
    personas,
    options,
    cta: one('track-gap-cta'),
    disclaimer: one('beta-note').replace(/\s*To suggest a correction.*$/, '')
  };
}

/** Why a question's persona tags are invalid, or '' when they are valid. Shared by the build and verify. */
export function personaTagProblems(tags, tagIds) {
  if (!tags.length) return 'data-personas is missing or empty; tag it with 1 to 3 of ' + tagIds.join(', ');
  if (tags.length > 3) return `data-personas has ${tags.length} tags; at most 3`;
  if (new Set(tags).size !== tags.length) return 'data-personas repeats a tag';
  if (tags.includes(ALL_PERSONA)) return `${ALL_PERSONA} is the all-questions view and is never a tag`;
  const unknown = tags.filter((t) => !tagIds.includes(t));
  if (unknown.length) return `unknown persona tag ${unknown.join(', ')}; use ${tagIds.join(', ')}`;
  return '';
}

/**
 * Every persona-tag problem in the runbook markup, as messages; empty when every question is validly tagged.
 * verify-runbook.mjs runs this so `npm run verify` fails on a missing tag, an unknown tag or ai-pm-leader used
 * as a tag, listing all of them at once instead of the first one loadModel() throws on.
 */
export function personaMarkupProblems(html) {
  const picker = (html.match(/<fieldset[^>]*data-persona-picker[\s\S]*?<\/fieldset>/) || [''])[0];
  const ids = [...picker.matchAll(/<input type="radio"[^>]*\svalue="([^"]+)"/g)].map((m) => m[1]);
  if (!ids.length) return ['no persona picker ([data-persona-picker]) with radio options'];
  const tagIds = ids.filter((id) => id !== ALL_PERSONA);
  const problems = [];
  for (const m of html.matchAll(/<div class="assess-q"[^>]*>/g)) {
    const tag = m[0];
    const key = (tag.match(/\sdata-key="([^"]+)"/) || [])[1] || '(no data-key)';
    const raw = (tag.match(/\sdata-personas="([^"]*)"/) || [])[1];
    const bad = personaTagProblems((raw || '').trim().split(/\s+/).filter(Boolean), tagIds);
    if (bad) problems.push(`${key}: ${bad}`);
  }
  return problems;
}
