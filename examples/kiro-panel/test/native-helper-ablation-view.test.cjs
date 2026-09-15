const test = require('node:test')
const assert = require('node:assert/strict')
const { renderHelperAblationHtml } =
  require('../src/native-helper-ablation-view.cjs')

test('synthetic answers are redacted and HTML-escaped in a script-disabled view', () => {
  const html = renderHelperAblationHtml({
    metadata: { status: 'PAIR_FINISHED' },
    display: { aPrimeText: '<img src=x onerror="alert(1)"> secret\n\nsecond paragraph',
      bText: 'B & answer' },
  }, value => value.replace('secret', '[redacted]'))
  assert.match(html, /default-src 'none'/)
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; \[redacted\]/)
  assert.doesNotMatch(html, /<img| secret/)
  assert.match(html, /B &amp; answer/)
  assert.match(html, /\[redacted\]<\/p><p>second paragraph<\/p>/)
  assert.match(html, /exploratory comparison, not causal proof/)
  assert.match(html, /context JSON omits personalization and relevantLedgerEntries/)
  assert.match(html, /Both still include recentEpisodes/)
  assert.match(html, /B · curated Ledger fields omitted/)
  assert.match(html, /common evaluation wrapper/)
})
