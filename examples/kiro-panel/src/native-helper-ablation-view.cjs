const MAX_DISPLAY_CHARACTERS = 50_000

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function renderHelperAblationHtml(result, redact) {
  if (!result || !result.metadata || !result.display ||
      typeof redact !== 'function')
    throw new Error('HELPER_ABLATION_VIEW_INVALID')
  const answer = value => {
    if (typeof value !== 'string' || !value.trim()) return '<p>No completed answer.</p>'
    const redacted = redact(value)
    if (typeof redacted !== 'string')
      throw new Error('HELPER_ABLATION_VIEW_REDACTION_INVALID')
    const bounded = redacted.slice(0, MAX_DISPLAY_CHARACTERS)
    const paragraphs = bounded.split(/\n{2,}/).map(part =>
      `<p>${part.split('\n').map(escapeHtml).join('<br>')}</p>`).join('')
    return paragraphs + (redacted.length > MAX_DISPLAY_CHARACTERS ?
      '<p>[display truncated]</p>' : '')
  }
  const status = result.metadata.status === 'PAIR_FINISHED' ?
    'Pair finished; inspect the actual answers before judging use of context.' :
    'Pair incomplete; do not draw a comparison verdict.'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">` +
    `<title>Native Helper Context Ablation</title></head><body>` +
    `<h1>Native Helper Context Ablation</h1><p>${escapeHtml(status)}</p>` +
    `<p>Two fresh protected sessions use the same Sonnet 4.5 model and a ` +
    `common evaluation wrapper. A′ includes the full captured Core context. ` +
    `B uses the same question, notice and marker but its context JSON omits ` +
    `personalization and relevantLedgerEntries. Both still include recentEpisodes ` +
    `and other shared Core history, so this tests only the added value of the ` +
    `curated Ledger fields. This is an exploratory comparison, not causal ` +
    `proof. These synthetic turns are not Core Evidence.</p>` +
    `<section><h2>A′ · full Core context</h2><div>${answer(result.display.aPrimeText)}</div></section>` +
    `<section><h2>B · curated Ledger fields omitted</h2><div>${answer(result.display.bText)}</div></section>` +
    `</body></html>`
}

module.exports = { renderHelperAblationHtml }
