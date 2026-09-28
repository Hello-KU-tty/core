// Reconstruct one comparison-only method without changing source outside that method.
// Windows checkouts may use CRLF even when the committed baseline blob uses LF.
function evidenceMethodBounds(source) {
  const starts = [...source.matchAll(/\r?\n {2}#readEvidenceTrace\(\r?\n/g)]
  const ends = [...source.matchAll(/\r?\n {2}async #getResultDescriptor\(\r?\n/g)]
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index <= starts[0].index)
    throw new Error('REFERENCE_METHOD_BOUNDARY_DRIFT')
  return { start: starts[0].index, end: ends[0].index }
}

export function replaceEvidenceMethodWithBaseline(current, baseline) {
  if (typeof current !== 'string' || typeof baseline !== 'string')
    throw new Error('REFERENCE_METHOD_SOURCE_INVALID')
  const destination = evidenceMethodBounds(current)
  const original = evidenceMethodBounds(baseline)
  return (
    current.slice(0, destination.start) +
    baseline.slice(original.start, original.end) +
    current.slice(destination.end)
  )
}
