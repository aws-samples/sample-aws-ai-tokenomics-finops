/**
 * The self-assessment engine: state, persistence, tallies, summary panels, exports.
 *
 * Extracted verbatim from the runbook's original single inline script block, lines 466-687 of the block.
 */
import { assessorLine } from './stamp.mjs';
import { renderCoverage, accessibleLabel } from './viz/coverage.mjs';

export function assessment() {
    var STORE = 'tokenomics-assessment-v1';
    var NOTESTORE = 'tokenomics-assessment-notes-v1';
    // maturity scale wording (data-v tokens stay yes/wip/no/na for storage + CSS)
    var LABELS = { yes: 'Fully covered', wip: 'Partially', no: 'Not covered', na: 'N/A' };
    var allQuestions = Array.prototype.slice.call(document.querySelectorAll('[data-assess-q]'));
    allQuestions.forEach(function (q) {
      var key = q.getAttribute('data-key');
      if (!q.id && key) q.id = 'question-' + key;
    });
    if (!allQuestions.length) return;

    // answers + notes persist globally in one store (survive across layers); each
    // summary panel is SCOPED to the questions inside its own layer via data-ar-scope.
    var state = {}, notes = {};
    try { state = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { state = {}; }
    try { notes = JSON.parse(localStorage.getItem(NOTESTORE) || '{}') || {}; } catch (e) { notes = {}; }
    function persist() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
    function persistNotes() { try { localStorage.setItem(NOTESTORE, JSON.stringify(notes)); } catch (e) {} }

    function qText(q) { return q.querySelector('.assess-qtext') ? q.querySelector('.assess-qtext').textContent.replace(/^Q\d+\s*/, '').trim() : ''; }
    function qId(q) { return q.querySelector('.qid') ? q.querySelector('.qid').textContent.trim() : ''; }

    function applyQuestion(q) {
      var key = q.getAttribute('data-key');
      var val = state[key] || '';
      q.setAttribute('data-state', val);
      Array.prototype.forEach.call(q.querySelectorAll('.seg button'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-v') === val ? 'true' : 'false');
      });
      var gap = q.querySelector('details.assess-gap');
      if (gap) {
        if (val === 'no' || val === 'wip') gap.open = true;
        else if (val === 'yes' || val === 'na') gap.open = false;
      }
      var ta = q.querySelector('[data-assess-note]');
      if (ta && notes[key] != null && ta.value !== notes[key]) ta.value = notes[key];
    }

    function updateTally(box) {
      var qs = Array.prototype.slice.call(box.querySelectorAll('[data-assess-q]'));
      var total = qs.length, yes = 0, gaps = 0, answered = 0;
      qs.forEach(function (q) {
        var v = state[q.getAttribute('data-key')] || '';
        if (v) answered++;
        if (v === 'yes') yes++;
        if (v === 'no' || v === 'wip') gaps++;
      });
      var tally = box.querySelector('[data-assess-tally]');
      if (!tally) return;
      var done = answered === total;
      tally.innerHTML =
        '<span class="pill ok">' + yes + '/' + total + ' covered</span>' +
        '<span class="pill gap' + (gaps ? ' active' : '') + '">' + gaps + ' gap' + (gaps === 1 ? '' : 's') + '</span>' +
        (done ? '<span class="pill done">complete</span>' : '<span class="pill">' + answered + '/' + total + ' answered</span>');
    }

    // ---- per-summary-panel scoping ----
    // A panel with data-ar-scope="<layer>" reports on the questions whose lever's
    // assess block carries data-assess-group="<layer>". Fall back to all questions.
    //
    // A lever the reader has taken out of their assessment (site/src/js/scope.mjs marks its `.assess`
    // block `data-scope-out`) contributes no questions anywhere: not to the tally, the panel, the
    // dashboard, the cost map or an export. Reading the attribute rather than importing the module keeps
    // the two independent; `runbook:scope` tells this module when to recount.
    function inScope(q) {
      var blk = q.closest('.assess');
      return !(blk && blk.hasAttribute('data-scope-out'));
    }
    function questionsForScope(scope) {
      if (!scope) return allQuestions.filter(inScope);
      return allQuestions.filter(function (q) {
        var blk = q.closest('.assess');
        return blk && blk.getAttribute('data-assess-group') === scope && inScope(q);
      });
    }
    /** Names of the levers in a layer the reader has excluded, for the "Out of scope" line in a report. */
    function outOfScopeFor(scope) {
      var sel = '.assess[data-scope-out]' + (scope ? '[data-assess-group="' + scope + '"]' : '');
      return Array.prototype.slice.call(document.querySelectorAll(sel)).map(function (b) { return b.getAttribute('data-assess-lever') || ''; });
    }

    function reportModel(qs) {
      var c = { yes: 0, wip: 0, no: 0, na: 0, answered: 0, total: qs.length };
      qs.forEach(function (q) { var v = state[q.getAttribute('data-key')] || ''; if (v) { c.answered++; c[v]++; } });
      var gaps = qs.filter(function (q) { var v = state[q.getAttribute('data-key')] || ''; return v === 'no' || v === 'wip'; })
        .map(function (q) { var key = q.getAttribute('data-key');
          return { lever: q.getAttribute('data-lever'), anchor: q.getAttribute('data-anchor'), state: state[key], qid: qId(q), text: qText(q), note: (notes[key] || '').trim() }; });
      return { c: c, gaps: gaps };
    }

    function esc(t) { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function flash(btn, msg) { var old = btn.textContent; btn.textContent = msg; setTimeout(function () { btn.textContent = old; }, 1600); }

    // ---- one report model, any number of scopes ----------------------------
    // Per-layer panels pass a single scope; the cross-layer dashboard passes all six. Making the
    // builders take a LIST rather than duplicating them is what makes a whole-assessment export
    // possible without a second, drifting copy of the report format.

    /** @returns {{scope:string,title:string,qs:Element[],m:object}[]} one section per scope, in page order */
    function sectionsFor(scopes) {
      return scopes.map(function (sc) {
        var qs = questionsForScope(sc.scope);
        return { scope: sc.scope, title: sc.title, slug: sc.slug, qs: qs, m: reportModel(qs), out: outOfScopeFor(sc.scope) };
      });
    }

    /** Roll several sections into one set of counts, for the headline and the combined export. */
    function totalsFor(sections) {
      var c = { yes: 0, wip: 0, no: 0, na: 0, answered: 0, total: 0 };
      var gaps = 0;
      sections.forEach(function (sec) {
        ['yes', 'wip', 'no', 'na', 'answered', 'total'].forEach(function (k) { c[k] += sec.m.c[k]; });
        gaps += sec.m.gaps.length;
      });
      return { c: c, gaps: gaps };
    }

    function coverageSentence(c) {
      return 'Coverage: ' + c.yes + ' fully covered · ' + c.wip + ' partially · ' + c.no
        + ' not covered · ' + c.na + ' N/A (' + c.answered + '/' + c.total + ' answered).';
    }

    function markdownReport(title, sections) {
      var t = totalsFor(sections);
      var lines = ['# AI Tokenomics FinOps assessment — ' + title, ''];
      // When it was run. The static site has no sign-in, so the report is dated rather than attributed.
      lines.push(assessorLine(), '');
      lines.push(coverageSentence(t.c), '');
      // A report that silently omits a lever reads as if the lever were covered. Say what was left out.
      var outAll = sections.reduce(function (acc, sec) { return acc.concat(sec.out || []); }, []);
      if (outAll.length) lines.push('Out of scope (excluded from every count above): ' + outAll.join(', ') + '.', '');
      if (t.c.answered < t.c.total) {
        lines.push('> **Incomplete assessment — no final conclusions are available.** '
          + (t.c.total - t.c.answered) + ' questions remain unanswered.', '');
      }

      // A per-layer table only earns its place in a multi-layer report; for one layer it would just
      // restate the line above.
      if (sections.length > 1) {
        lines.push('| Layer | Answered | Fully covered | Partially | Not covered | N/A | Gaps |');
        lines.push('|---|---|---|---|---|---|---|');
        sections.forEach(function (sec) {
          var c = sec.m.c;
          lines.push('| ' + sec.title + ' | ' + c.answered + '/' + c.total + ' | ' + c.yes + ' | '
            + c.wip + ' | ' + c.no + ' | ' + c.na + ' | ' + sec.m.gaps.length + ' |');
        });
        lines.push('');
      }

      lines.push('## Gaps to address', '');
      if (t.gaps === 0) {
        if (t.c.answered < t.c.total) {
          lines.push('_No gap conclusion is available yet because ' + (t.c.total - t.c.answered) + ' questions are unanswered._', '');
        } else {
          lines.push('_No gaps recorded: every answered question is fully covered or N/A._', '');
        }
      }
      else {
        sections.forEach(function (sec) {
          if (!sec.m.gaps.length) return;
          if (sections.length > 1) lines.push('### ' + sec.title, '');
          var byLever = {};
          sec.m.gaps.forEach(function (g) { (byLever[g.lever] = byLever[g.lever] || []).push(g); });
          Object.keys(byLever).forEach(function (lever) {
            lines.push((sections.length > 1 ? '#### ' : '### ') + lever);
            byLever[lever].forEach(function (g) { lines.push('- [' + LABELS[g.state] + '] ' + g.qid + ': ' + g.text + (g.note ? '  \n  Note: ' + g.note : '')); });
            lines.push('');
          });
        });
      }

      lines.push('## Full answer log', '');
      sections.forEach(function (sec) {
        if (sections.length > 1) lines.push('### ' + sec.title, '');
        var curLever = null;
        sec.qs.forEach(function (q) {
          var lev = q.getAttribute('data-lever');
          if (lev !== curLever) { lines.push((sections.length > 1 ? '#### ' : '### ') + lev); curLever = lev; }
          var key = q.getAttribute('data-key'), v = state[key] || '', note = (notes[key] || '').trim();
          lines.push('- ' + qId(q) + ' [' + (v ? LABELS[v] : 'unanswered') + ']: ' + qText(q) + (note ? '  \n  Note: ' + note : ''));
        });
        lines.push('');
      });
      return lines.join('\n');
    }

    /**
     * Build the print document and hand it to the browser.
     *
     * Deliberately NOT a client-side PDF library. The report is real DOM styled by the same tokens as
     * the page, so adding a lever or a field costs the export nothing; a jsPDF implementation would be
     * a second layout engine to keep in step, and ~400KB vendored under a CSP that forbids CDNs. The
     * trade is that the browser's print dialog appears -- mitigated by swapping document.title, which
     * is what Chrome, Edge and Safari derive the suggested filename from.
     */
    function printReport(title, sections, slug) {
      var t = totalsFor(sections);
      var html = [];

      html.push('<div class="apr-cover">');
      html.push('<h1>AI Tokenomics FinOps assessment</h1>');
      html.push('<p class="apr-scope">' + esc(title) + '</p>');
      html.push('<p class="apr-by">' + esc(assessorLine()) + '</p>');
      html.push('<p class="apr-cov">' + esc(coverageSentence(t.c)) + '</p>');
      var outAllPrint = sections.reduce(function (acc, sec) { return acc.concat(sec.out || []); }, []);
      if (outAllPrint.length) html.push('<p class="apr-out">Out of scope (excluded from every count): ' + esc(outAllPrint.join(', ')) + '.</p>');
      html.push('</div>');
      if (t.c.answered < t.c.total) {
        html.push('<p class="apr-incomplete"><strong>Incomplete assessment — no final conclusions are available.</strong> '
          + (t.c.total - t.c.answered) + ' questions remain unanswered.</p>');
      }

      // A per-layer table is the thing a reviewer actually reads first in a whole-assessment export.
      if (sections.length > 1) {
        html.push('<h2>Coverage by layer</h2>');
        html.push('<table class="apr-table"><thead><tr><th>Layer</th><th>Answered</th><th>Fully covered</th>'
          + '<th>Partially</th><th>Not covered</th><th>N/A</th><th>Gaps</th></tr></thead><tbody>');
        sections.forEach(function (sec) {
          var c = sec.m.c;
          html.push('<tr><td>' + esc(sec.title) + '</td><td>' + c.answered + '/' + c.total + '</td><td>'
            + c.yes + '</td><td>' + c.wip + '</td><td>' + c.no + '</td><td>' + c.na + '</td><td>'
            + sec.m.gaps.length + '</td></tr>');
        });
        html.push('</tbody></table>');
      }

      html.push('<h2>Gaps to address</h2>');
      if (t.gaps === 0) {
        if (t.c.answered < t.c.total) {
          html.push('<p class="apr-none">No gap conclusion is available yet because '
            + (t.c.total - t.c.answered) + ' questions are unanswered.</p>');
        } else {
          html.push('<p class="apr-none">No gaps recorded: every answered question is fully covered or N/A.</p>');
        }
      } else {
        sections.forEach(function (sec) {
          if (!sec.m.gaps.length) return;
          if (sections.length > 1) html.push('<h3>' + esc(sec.title) + '</h3>');
          html.push('<table class="apr-table"><thead><tr><th>Lever</th><th>Question</th><th>Status</th><th>Note</th></tr></thead><tbody>');
          sec.m.gaps.forEach(function (g) {
            html.push('<tr><td>' + esc(g.lever) + '</td><td>' + esc(g.qid) + ': ' + esc(g.text) + '</td>'
              + '<td class="apr-st apr-st-' + g.state + '">' + esc(LABELS[g.state]) + '</td>'
              + '<td>' + esc(g.note || '') + '</td></tr>');
          });
          html.push('</tbody></table>');
        });
      }

      if (t.c.answered > 0) {
        html.push('<h2>Answered questions</h2>');
        sections.forEach(function (sec) {
          var answered = sec.qs.filter(function (q) { return !!state[q.getAttribute('data-key')]; });
          if (!answered.length) return;
          if (sections.length > 1) html.push('<h3>' + esc(sec.title) + '</h3>');
          var curLever = null;
          answered.forEach(function (q) {
            var lev = q.getAttribute('data-lever');
            if (lev !== curLever) { html.push('<h4>' + esc(lev) + '</h4>'); curLever = lev; }
            var key = q.getAttribute('data-key'), v = state[key] || '', note = (notes[key] || '').trim();
            html.push('<p class="apr-q"><span class="apr-state">[' + esc(LABELS[v]) + ']</span> '
              + esc(qId(q)) + ': ' + esc(qText(q)) + (note ? '<br><span class="apr-note">Note: ' + esc(note) + '</span>' : '') + '</p>');
          });
        });
      }
      if (t.c.answered < t.c.total) {
        html.push('<p class="apr-appendix">This concise printout omits ' + (t.c.total - t.c.answered)
          + ' unanswered questions. Complete the assessment or download the Markdown report for the full question log.</p>');
      }

      var root = document.getElementById('assess-print-root');
      if (!root) { root = document.createElement('div'); root.id = 'assess-print-root'; document.body.appendChild(root); }
      root.innerHTML = html.join('\n');

      // The browser suggests a filename from document.title, so this is the only handle we have on it.
      var prevTitle = document.title;
      document.title = 'genai-cost-assessment-' + (slug || 'assessment');
      document.body.classList.add('assess-printing');
      var cleanup = function () {
        document.body.classList.remove('assess-printing');
        document.title = prevTitle;
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      // Fallback for browsers that do not fire afterprint reliably: focus returns to the window when
      // the print dialog closes. Deliberately NOT a timer -- window.print() does not block everywhere,
      // so a timed cleanup can tear the report out from under a dialog that is still open. Leaving the
      // class on for longer than necessary is harmless, since the rules that act on it are all inside
      // @media print.
      window.addEventListener('focus', cleanup, { once: true });
      window.print();
    }

    // wire every summary panel to its own scope
    var panels = Array.prototype.slice.call(document.querySelectorAll('.assess-report'));
    function renderPanel(panel) {
      var scope = panel.getAttribute('data-ar-scope');
      var qs = questionsForScope(scope);
      var m = reportModel(qs), c = m.c;
      var countEl = panel.querySelector('[data-ar-count]');
      var covEl = panel.querySelector('[data-ar-coverage]');
      var listEl = panel.querySelector('[data-ar-list]');
      var emptyEl = panel.querySelector('[data-ar-empty]');
      if (countEl) countEl.textContent = m.gaps.length + ' gap' + (m.gaps.length === 1 ? '' : 's') + ' · ' + c.answered + '/' + c.total + ' answered';
      if (covEl) {
        // One shared component for the six panels and the dashboard. Geometry is SVG attributes, so
        // there is no inline style for the site's CSP to block and no byte-exact build patch to keep
        // in sync -- see site/src/js/viz/coverage.mjs.
        renderCoverage(covEl, c, { title: panel.getAttribute('data-ar-title') || '' });
      }
      if (listEl) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = m.gaps.length > 0;
        m.gaps.forEach(function (g) {
          var li = document.createElement('li');
          var st = document.createElement('span'); st.className = 'gl-state ' + g.state; st.textContent = LABELS[g.state];
          var a = document.createElement('a'); a.href = '#' + g.anchor; a.textContent = g.lever + ' · ' + g.qid;
          var txt = document.createElement('span'); txt.textContent = g.text;
          li.appendChild(st); li.appendChild(a); li.appendChild(document.createTextNode(' — ')); li.appendChild(txt);
          if (g.note) { var nt = document.createElement('span'); nt.className = 'gl-notes'; nt.textContent = 'Note: ' + g.note; li.appendChild(nt); }
          listEl.appendChild(li);
        });
      }
    }

    // ---- the cross-layer dashboard -----------------------------------------
    // Every panel above is scoped to one layer, by design, which means nothing in the runbook ever
    // showed the six layers together. Scopes are discovered from the panels themselves, so adding a
    // layer stays a matter of adding HTML -- the contract in
    // the lever-format design notes §7.

    var dashes = Array.prototype.slice.call(document.querySelectorAll('[data-track-dashboard]'));

    function trackSection(key) {
      return document.getElementById(key === 't1' ? 'track-1' : key === 't2' ? 'track-2' : '');
    }

    function scopesForTrack(key) {
      var section = trackSection(key);
      return panels.filter(function (p) { return section && section.contains(p); }).map(function (p) {
        return {
          scope: p.getAttribute('data-ar-scope'),
          title: p.getAttribute('data-ar-title') || 'Assessment',
          slug: p.getAttribute('data-ar-slug') || 'assessment'
        };
      });
    }

    /** @returns {{scope:string,title:string,slug:string}[]} every layer, in page order */
    function allScopes() {
      return panels.map(function (p) {
        return {
          scope: p.getAttribute('data-ar-scope'),
          title: p.getAttribute('data-ar-title') || 'Assessment',
          slug: p.getAttribute('data-ar-slug') || 'assessment'
        };
      });
    }

    /**
     * The layer most worth attention: the highest share of answered questions that came back a gap.
     *
     * Gated on a minimum number of answered questions, because a ratio over one or two answers is
     * noise and naming a "weakest layer" off it would be worse than saying nothing.
     */
    var WEAKEST_MIN_ANSWERED = 3;
    function weakestOf(sections) {
      var worst = null;
      sections.forEach(function (sec) {
        var c = sec.m.c;
        if (c.answered < WEAKEST_MIN_ANSWERED) return;
        var ratio = (c.no + c.wip) / c.answered;
        if (ratio <= 0) return;
        if (!worst || ratio > worst.ratio) worst = { sec: sec, ratio: ratio };
      });
      return worst;
    }

    function renderDashboard(dash) {
      if (!dash) return;
      var trackKey = dash.getAttribute('data-track-dashboard');
      var sections = sectionsFor(scopesForTrack(trackKey));
      var t = totalsFor(sections);

      var metricsEl = dash.querySelector('[data-ad-metrics]');
      var rowsEl = dash.querySelector('[data-ad-rows]');
      var emptyEl = dash.querySelector('[data-ad-empty]');
      var weakEl = dash.querySelector('[data-ad-weakest]');
      var progressEl = dash.querySelector('[data-ad-progress]');
      var progressFill = dash.querySelector('[data-ad-progress-fill]');
      var progressLabel = dash.querySelector('[data-ad-progress-label]');
      var startBtn = dash.querySelector('[data-ad-start]');
      var trackQuestions = sections.reduce(function (out, sec) { return out.concat(sec.qs); }, []);
      var firstUnanswered = trackQuestions.find(function (q) { return !state[q.getAttribute('data-key')]; });
      var pct = t.c.total ? Math.round((t.c.answered / t.c.total) * 100) : 0;
      var applicable = t.c.yes + t.c.wip + t.c.no;
      var applicableScore = applicable ? Math.round((t.c.yes / applicable) * 100) : null;

      var started = t.c.answered > 0;
      dash.setAttribute('data-assessment-state', !started ? 'empty' : t.c.answered === t.c.total ? 'complete' : 'incomplete');
      if (emptyEl) emptyEl.hidden = started;
      if (rowsEl) rowsEl.hidden = !started;
      if (progressEl) {
        progressEl.setAttribute('aria-valuemax', String(t.c.total));
        progressEl.setAttribute('aria-valuenow', String(t.c.answered));
        progressEl.setAttribute('aria-valuetext', t.c.answered + ' of ' + t.c.total + ' questions answered');
      }
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressLabel) progressLabel.textContent = t.c.answered + ' / ' + t.c.total + ' answered · ' + pct + '% complete';
      if (startBtn) {
        var destination = firstUnanswered || trackQuestions[0];
        if (destination) startBtn.setAttribute('href', '#' + destination.id);
        startBtn.textContent = t.c.answered === 0 ? 'Start assessment'
          : firstUnanswered ? 'Continue assessment' : 'Review assessment';
      }

      if (metricsEl) {
        metricsEl.innerHTML = '';
        [[pct + '%', 'complete', ''],
         [String(t.c.answered) + '/' + t.c.total, 'questions answered', ''],
         [applicableScore == null ? '—' : applicableScore + '%', 'applicable coverage', applicableScore != null && applicableScore < 60 ? ' is-gap' : ''],
         [String(t.gaps), t.gaps === 1 ? 'gap to address' : 'gaps to address', t.gaps ? ' is-gap' : '']
        ].forEach(function (m) {
          var box = document.createElement('span');
          box.className = 'ad-metric' + m[2];
          var n = document.createElement('span'); n.className = 'ad-metric-n'; n.textContent = m[0];
          var l = document.createElement('span'); l.className = 'ad-metric-l'; l.textContent = m[1];
          box.appendChild(n); box.appendChild(l);
          metricsEl.appendChild(box);
        });
      }

      if (rowsEl) {
        rowsEl.innerHTML = '';
        sections.forEach(function (sec) {
          var row = document.createElement('div');
          row.className = 'ad-row';

          var head = document.createElement('div');
          head.className = 'ad-row-head';
          var a = document.createElement('a');
          a.className = 'ad-row-title';
          a.href = '#' + sec.scope;   // the layer heading, e.g. #t1-model-inference
          a.textContent = sec.title;
          var n = document.createElement('span');
          n.className = 'ad-row-n';
          n.textContent = sec.m.c.answered + '/' + sec.m.c.total + ' answered'
            + (sec.m.gaps.length ? ' · ' + sec.m.gaps.length + ' gap' + (sec.m.gaps.length === 1 ? '' : 's') : '');
          head.appendChild(a); head.appendChild(n);
          row.appendChild(head);

          var cov = document.createElement('div');
          renderCoverage(cov, sec.m.c, { compact: true, title: sec.title });
          row.appendChild(cov);

          rowsEl.appendChild(row);
        });
      }

      var gapList = dash.querySelector('[data-ad-gap-list]');
      var gapEmpty = dash.querySelector('[data-ad-gap-empty]');
      if (gapList) {
        gapList.innerHTML = '';
        var dashboardGaps = [];
        sections.forEach(function (sec) {
          sec.m.gaps.forEach(function (gap) { dashboardGaps.push(gap); });
        });
        if (gapEmpty) {
          gapEmpty.hidden = dashboardGaps.length > 0;
          gapEmpty.textContent = t.c.answered === t.c.total
            ? 'No gaps recorded. Every question is fully covered or N/A.'
            : t.c.answered
              ? 'No current gaps among answered questions. ' + (t.c.total - t.c.answered) + ' questions remain unanswered.'
              : 'Assessment not started. No gap conclusion is available until questions are answered.';
        }
        dashboardGaps.forEach(function (g) {
          var li = document.createElement('li');
          var st = document.createElement('span'); st.className = 'gl-state ' + g.state; st.textContent = LABELS[g.state];
          var a = document.createElement('a'); a.href = '#' + g.anchor; a.textContent = g.lever + ' · ' + g.qid;
          var txt = document.createElement('span'); txt.textContent = g.text;
          li.appendChild(st); li.appendChild(a); li.appendChild(txt);
          if (g.note) {
            var nt = document.createElement('span'); nt.className = 'gl-notes'; nt.textContent = 'Note: ' + g.note;
            li.appendChild(nt);
          }
          gapList.appendChild(li);
        });
      }

      if (weakEl) {
        var worst = weakestOf(sections);
        if (worst && started) {
          weakEl.hidden = false;
          weakEl.textContent = 'Most gaps relative to what you have answered: '
            + worst.sec.title + ' (' + Math.round(worst.ratio * 100) + '% of its answers are a gap). '
            + 'Start there.';
        } else {
          weakEl.hidden = true;
        }
      }
    }

    /**
     * The id of the `<h4>` a question belongs to.
     *
     * Walks back from the question's `.assess` block to the nearest preceding heading with an id, which is
     * the lever by construction: the canonical lever format puts the `<h4 id>` immediately before the
     * lever's `details.lever-why` and its `.assess` block
     * (the lever-format design notes §2).
     *
     * NOT `data-anchor`, even though it is documented as the lever's `<h4 id>`. That attribute is the jump
     * target for the gap report, and one question uses it to deep-link a specific paragraph instead
     * (`car-q3` -> `#cost-safety-caveat`). Reading position rather than the attribute means a lever can
     * never end up with an orphan bucket of questions filed under an id that is not a lever, and the map's
     * totals are guaranteed to add up to the assessment's own.
     */
    function leverIdFor(q) {
      var node = q.closest('.assess') || q;
      while (node) {
        if (/^H[1-6]$/.test(node.tagName) && node.id) return node.id;
        node = node.previousElementSibling;
      }
      return q.getAttribute('data-anchor') || '';
    }

    /**
     * Every lever's own counts, keyed by the lever's heading id.
     *
     * A layer's `answered/total` cannot say which of its levers is the one with the gap, and that is the
     * question the cost structure map exists to answer.
     *
     * `notes` is a COUNT of questions carrying a note, not the text: the map only needs to know a lever has
     * been written on, and keeping the words out of the event means the notes have exactly one reader.
     *
     * @returns {Object<string,{total:number,answered:number,yes:number,wip:number,no:number,na:number,
     *                          gaps:number,notes:number}>}
     */
    function leverCounts() {
      var out = {};
      allQuestions.forEach(function (q) {
        if (!inScope(q)) return;
        var anchor = leverIdFor(q);
        if (!anchor) return;
        var rec = out[anchor] || (out[anchor] =
          { total: 0, answered: 0, yes: 0, wip: 0, no: 0, na: 0, gaps: 0, notes: 0 });
        var key = q.getAttribute('data-key');
        var v = state[key] || '';
        rec.total++;
        if (v) {
          rec.answered++;
          rec[v]++;
          if (v === 'no' || v === 'wip') rec.gaps++;
        }
        if ((notes[key] || '').trim()) rec.notes++;
      });
      return out;
    }

    function refreshAll() {
      document.querySelectorAll('.assess').forEach(updateTally);
      panels.forEach(renderPanel);
      dashes.forEach(renderDashboard);

      // Publish the counts. The wayfinder's rings and the cost structure map read this rather than reaching
      // into `state`, so there is exactly one owner of the answers and the modules stay independent.
      var byScope = {};
      allScopes().forEach(function (sc) {
        var m = reportModel(questionsForScope(sc.scope));
        byScope[sc.scope] = { c: m.c, gaps: m.gaps.length };
      });
      document.dispatchEvent(new CustomEvent('runbook:coverage', {
        detail: { byScope: byScope, byLever: leverCounts() }
      }));
    }

    /**
     * Wire Copy / Download / Export-as-PDF / Reset on one container.
     *
     * Shared by the six per-layer panels and the cross-layer dashboard. `getScopes` is a function, not
     * an array, so the dashboard always exports the CURRENT set of layers rather than a list captured
     * at wire time -- and so both surfaces are guaranteed to produce the same report format.
     */
    function wireActions(root, opts) {
      var getScopes = opts.getScopes;
      var reportTitle = opts.title;
      var fileSlug = opts.slug;
      var sel = opts.sel;

      var copyBtn = root.querySelector(sel.copy);
      if (copyBtn) copyBtn.addEventListener('click', function () {
        var report = markdownReport(reportTitle(), sectionsFor(getScopes()));
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(report).then(function () { flash(copyBtn, 'Copied ✓'); }, function () { window.prompt('Copy the report below:', report); });
        } else { window.prompt('Copy the report below:', report); }
      });

      var dlBtn = root.querySelector(sel.download);
      if (dlBtn) dlBtn.addEventListener('click', function () {
        var report = markdownReport(reportTitle(), sectionsFor(getScopes()));
        var blob = new Blob([report], { type: 'text/markdown' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'genai-cost-assessment-' + fileSlug() + '.md';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        flash(dlBtn, 'Downloaded ✓');
      });

      var pdfBtn = root.querySelector(sel.pdf);
      if (pdfBtn) pdfBtn.addEventListener('click', function () {
        printReport(reportTitle(), sectionsFor(getScopes()), fileSlug());
      });

      var track = root.closest('section#track-1, section#track-2');
      var expandBtn = sel.expand ? root.querySelector(sel.expand) : null;
      var collapseBtn = sel.collapse ? root.querySelector(sel.collapse) : null;
      var guidance = track ? Array.prototype.slice.call(track.querySelectorAll('details.lever-why, details.assess-gap, details.read-more')) : [];
      function syncGuidanceActions() {
        if (!expandBtn || !collapseBtn) return;
        var allOpen = guidance.length > 0 && guidance.every(function (d) { return d.open; });
        expandBtn.hidden = allOpen;
        collapseBtn.hidden = !allOpen;
      }
      if (expandBtn && track) expandBtn.addEventListener('click', function () {
        guidance.forEach(function (d) { d.open = true; });
        syncGuidanceActions();
      });
      if (collapseBtn && track) collapseBtn.addEventListener('click', function () {
        guidance.forEach(function (d) { d.open = false; });
        syncGuidanceActions();
      });
      guidance.forEach(function (d) { d.addEventListener('toggle', syncGuidanceActions); });
      syncGuidanceActions();

      var resetBtn = root.querySelector(sel.reset);
      if (resetBtn) resetBtn.addEventListener('click', function () {
        var scopes = getScopes();
        // Resetting one layer is routine; resetting the whole assessment throws away work from several
        // sittings, so that one asks first.
        if (scopes.length > 1) {
          var n = totalsFor(sectionsFor(scopes)).c.answered;
          if (n > 0 && !window.confirm('Clear all ' + n + ' answers and notes in ' + reportTitle() + '? This cannot be undone.')) return;
        }
        scopes.forEach(function (sc) {
          questionsForScope(sc.scope).forEach(function (q) {
            var key = q.getAttribute('data-key');
            delete state[key]; delete notes[key];
            var ta = q.querySelector('[data-assess-note]'); if (ta) ta.value = '';
            applyQuestion(q);
          });
        });
        persist(); persistNotes();
        // Reset means "start this layer again", which includes any lever the reader had taken out of scope.
        document.dispatchEvent(new CustomEvent('runbook:scope-reset', { detail: { scopes: scopes.map(function (sc) { return sc.scope; }) } }));
        refreshAll();
      });
    }

    panels.forEach(function (panel) {
      var scope = panel.getAttribute('data-ar-scope');
      var title = panel.getAttribute('data-ar-title') || 'Assessment';
      var slug = panel.getAttribute('data-ar-slug') || 'assessment';
      wireActions(panel, {
        getScopes: function () { return [{ scope: scope, title: title, slug: slug }]; },
        title: function () { return title; },
        slug: function () { return slug; },
        sel: { copy: '[data-ar-copy]', download: '[data-ar-download]', pdf: '[data-ar-pdf]', reset: '[data-ar-reset]' }
      });
    });

    dashes.forEach(function (dash) {
      var key = dash.getAttribute('data-track-dashboard');
      var title = dash.getAttribute('data-assessment-title') || (key === 't1' ? 'Track 1' : 'Track 2');
      wireActions(dash, {
        getScopes: function () { return scopesForTrack(key); },
        title: function () { return title; },
        slug: function () { return key === 't1' ? 'track-1' : 'track-2'; },
        sel: {
          copy: '[data-ad-copy]', download: '[data-ad-download]', pdf: '[data-ad-pdf]', reset: '[data-ad-reset]',
          expand: '[data-ad-expand]', collapse: '[data-ad-collapse]'
        }
      });
    });

    // wire the segmented controls + notes for every question
    allQuestions.forEach(function (q) {
      applyQuestion(q);
      Array.prototype.forEach.call(q.querySelectorAll('.seg button'), function (b) {
        b.addEventListener('click', function () {
          var key = q.getAttribute('data-key');
          var v = b.getAttribute('data-v');
          if (state[key] === v) { delete state[key]; } else { state[key] = v; }
          persist();
          applyQuestion(q);
          refreshAll();
        });
      });
      var ta = q.querySelector('[data-assess-note]');
      if (ta) {
        var key = q.getAttribute('data-key');
        ta.addEventListener('input', function () {
          if (ta.value.trim()) { notes[key] = ta.value; } else { delete notes[key]; }
          persistNotes();
          refreshAll();
        });
      }
    });

    refreshAll();

    // scope.mjs has already marked the DOM by the time this runs (main.mjs orders it first); this is for the
    // reader changing their mind later, when every count on the page has to follow.
    document.addEventListener('runbook:scope', function () { refreshAll(); });
}
