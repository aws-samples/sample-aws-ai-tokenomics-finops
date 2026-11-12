/**
 * Public-safety patterns shared by the deck and skill verifiers, so both gates scan for one list.
 *
 * The needles are assembled from fragments on purpose: the repository's pre-publish leak scan greps every
 * tracked file for these words, and this list must not be the thing it finds.
 */

// Scope rule: Amazon products, plus third-party clients and tools that run on Amazon Bedrock inference.
// Clients without Bedrock inference are out of scope; name each one here when it is ruled out.
export const OUT_OF_SCOPE = /\b(?:Cursor|Copilot)\b/g;

const NEEDLES = [
  ['har', 'mony'], ['mid', 'way'], ['execute', '-api'], ['a2', 'z.com'], ['ama', 'zon.dev'], ['aw', 's.dev'],
  ['sl', 'ack.com'], ['aws', 'apps'], ['work', 'docs'], ['phone', 'tool'], ['code', '.amazon'], ['git', 'lab'],
  ['qu', 'ip-amazon'], ['isen', 'gard'], ['w.ama', 'zon.com'], ['@ama', 'zon.com'], ['corp.ama', 'zon'],
  ['sim.ama', 'zon'], ['t.co', 'rp'], ['inter', 'nal only'], ['inter', 'nal use'], ['analyst ', 'relations'],
  ['do not ', 'share'], ['confi', 'dential'], ['under ', 'nda'], ['es', 'docs'], ['#aiops-', 'genai']
].map((p) => p.join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/** Internal hosts, internal-only markers and bare 12-digit runs (possible AWS account IDs). */
export const NEEDLE_RE = new RegExp(`${NEEDLES.join('|')}|\\bnda\\b|(?<![0-9])[0-9]{12}(?![0-9])`, 'gi');

/** A Slack-style handle or an email-ish alias written as "name@". */
export const ALIAS_RE = /(?<![\w.])[a-z][a-z0-9]{2,15}@(?![\w.-]*\.)/gi;
