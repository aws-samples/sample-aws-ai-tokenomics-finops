/**
 * The runbook's taxonomy, read out of the page: track -> actor-layer -> lever.
 *
 * This lived inside `wayfinder.mjs` while the right rail was the only thing that needed it. The cost
 * structure map needs the same tree, and two parsers of the same document is how the sidebar, the rail
 * and the map end up disagreeing about how many levers Agent Harness has. One module, one answer.
 *
 * The rule it exists to keep: **nothing is discovered from a hard-coded list.** Tracks, layers and
 * levers are read from the DOM on load, the same contract the assessment engine follows, so adding a
 * lever stays an HTML-only change.
 */

/** Layer slug on a `<h3 class="layer">` id, e.g. `t2-agent-harness` -> track key `t2`. */
const TRACK_OF_LAYER = /^(t\d)-/;

/**
 * A heading's own words.
 *
 * NOT `textContent`: initNav() runs first and appends an `<a class="heading-anchor">#</a>` to every
 * heading with an id, and shared levers carry a `<span class="tag shared">` pill. Both would end up in
 * the rail as "Model Inference#" and "Trim what the harness injects shared". Skipping the added elements
 * is more robust than stripping their text afterwards, because it keeps working if their wording changes.
 */
export function headingText(node) {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) { out += child.nodeValue; return; }
    if (child.nodeType !== 1) return;
    if (child.classList.contains('heading-anchor')) return;
    if (child.classList.contains('tag')) return;
    out += child.textContent;
  });
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Build the track → layer → lever model from the page itself.
 *
 * Walks each track section in document order and buckets levers into the layer heading that precedes
 * them, which is the only ordering that survives someone inserting a lever without telling us.
 *
 * @returns {{key:string,num:string,name:string,sectionId:string,
 *            layers:{id:string,name:string,scope:?string,title:?string,
 *                    levers:{id:string,text:string}[]}[]}[]}
 */
export function buildModel() {
  const tracks = [];

  document.querySelectorAll('main.content section[id^="track-"]').forEach((section) => {
    const h2 = section.querySelector('h2');
    if (!h2) return;

    // "Track 2 - Building agents on Amazon Bedrock" -> num + name, so the rail can show them separately.
    const heading = headingText(h2);
    const split = heading.split(/\s+[-–—]\s+/);
    const num = split.length > 1 ? split[0] : heading;
    const name = split.length > 1 ? split.slice(1).join(' - ') : '';

    const layers = [];
    let layer = null;

    section.querySelectorAll('h3.layer, h4[id], .assess-report').forEach((node) => {
      if (node.matches('h3.layer')) {
        layer = { id: node.id, name: headingText(node), scope: null, title: null, levers: [] };
        layers.push(layer);
        return;
      }
      if (!layer) return;
      if (node.matches('.assess-report')) {
        // The panel at a layer's end is where the layer's assessment scope is declared.
        layer.scope = node.getAttribute('data-ar-scope');
        layer.title = node.getAttribute('data-ar-title');
        return;
      }
      // Two things the lever declares about itself, both read here so nothing downstream has to infer them:
      //
      // `shared` — the content's own statement that this topic is treated on both tracks, carried by the
      //   pill next to the heading. Read from here rather than from the lever index, whose "Second
      //   treatment" column also marks a merely related lever.
      // `kind`   — `cross-reference` for a prose lever with no assessment of its own
      //   (the lever-format design notes §3). Declared rather than inferred from the absence of
      //   an `.assess` block, because an assessment someone forgot to author looks identical to a
      //   deliberate omission, and anything reading the absence would report the first as the second.
      layer.levers.push({
        id: node.id,
        text: headingText(node),
        shared: !!node.querySelector('.tag.shared'),
        kind: node.getAttribute('data-lever-kind') || 'lever'
      });
    });

    if (!layers.length) return;
    const key = (layers[0].id.match(TRACK_OF_LAYER) || [])[1] || section.id;
    tracks.push({ key, num, name, sectionId: section.id, layers });
  });

  return tracks;
}

/** Which track and layer does a given element id sit in? */
export function locate(model, id) {
  if (!id || !model) return { track: null, layer: null, lever: null };
  for (const track of model) {
    if (id === track.sectionId) return { track, layer: null, lever: null };
    for (const layer of track.layers) {
      if (id === layer.id) return { track, layer, lever: null };
      const lever = layer.levers.find((l) => l.id === id);
      if (lever) return { track, layer, lever };
    }
  }
  return { track: null, layer: null, lever: null };
}

/**
 * Which lever owns a given in-page id?
 *
 * Most ids handed around are lever headings, and `locate()` answers those. Some are not: a topic treated on
 * both tracks may point at a deeper anchor, because the treatment on one track is a question inside another
 * lever rather than a lever of its own. `#manage-the-model-lifecycle` is the live case — it is an id on the
 * `.assess-q` carrying Q4 of "Right-size the model to the task", kept there so the links written against it
 * still resolve. Anything that needs the LEVER behind such an anchor has to walk the document, and it belongs
 * here rather than in a consumer, for the same reason buildModel() is here: two answers to "which lever is
 * this" is how they come to disagree.
 *
 * The walk is by POSITION, the same rule assessment.mjs attributes questions by: from the anchor's own
 * `.assess` block, step back through its siblings to the first heading with an id that the model knows as a
 * lever. Reading position rather than an attribute means the answer cannot drift.
 *
 * `assessment.mjs` still carries its own copy of that walk (`leverIdFor`), which is not exported and starts
 * from a question rather than an arbitrary id. Folding it into this one sits under `EXPECT.questions === 83`
 * and the map's per-lever totals, so it is its own change, not a rider on this one.
 *
 * @returns {string} the owning lever's id, or '' when the id is not in a track at all.
 */
export function leverIdOwning(model, id) {
  if (!id) return '';
  const direct = locate(model, id).lever;
  if (direct) return direct.id;
  const start = document.getElementById(id);
  if (!start) return '';
  let node = start.closest('.assess') || start;
  while (node) {
    if (/^H[1-6]$/.test(node.tagName) && node.id && locate(model, node.id).lever) return node.id;
    node = node.previousElementSibling;
  }
  return '';
}

/** Every layer in the model, flattened, each tagged with the track it belongs to. */
export function eachLayer(model, fn) {
  (model || []).forEach((track) => track.layers.forEach((layer) => fn(layer, track)));
}
