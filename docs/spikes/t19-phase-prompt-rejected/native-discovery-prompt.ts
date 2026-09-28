// REJECTED experiment: retained for reproduction, never imported by product code.
// Pure host adapter: the canonical Markdown remains the only instruction source.
// Both Core and the packaged native host derive the exact same phase prompt.
const headings = [
  '최우선 원칙',
  'MCP 입력 운송 형식',
  '빠른 PREVIEW turn',
  'ENRICHMENT turn',
  '후보 생성',
  '후보 평가 기준',
  '사용자 반응과 반복',
  'Core 도구 사용 순서',
  '빠른 MERGE turn',
  'Learning Spec',
  '빠른 SPEC turn',
  'SPEC recovery turn',
  '표현 방식',
  '금지 사항',
] as const
type Heading = (typeof headings)[number]
const phaseHeadings: Readonly<Record<string, readonly Heading[]>> = {
  PREVIEW: ['후보 평가 기준', '빠른 PREVIEW turn'],
  ENRICH_FIRST: ['ENRICHMENT turn'],
  ENRICH_SECOND: ['ENRICHMENT turn'],
  ENRICH_SELECTED: ['ENRICHMENT turn'],
  ROUND: ['후보 생성', '후보 평가 기준', '사용자 반응과 반복', 'Core 도구 사용 순서'],
  MERGE: ['후보 평가 기준', '사용자 반응과 반복', '빠른 MERGE turn'],
  SPEC: ['Learning Spec', '빠른 SPEC turn'],
  SPEC_RECOVERY: ['Learning Spec', 'SPEC recovery turn'],
}

function invalid(): never {
  throw new Error('NATIVE_DISCOVERY_PROMPT_INVALID')
}

export function composeNativeDiscoveryPrompt(canonical: string, mode: string): string {
  if (!Object.hasOwn(phaseHeadings, mode)) throw new Error('NATIVE_DISCOVERY_MODE_INVALID')
  const text = canonical.replace(/\r\n/g, '\n')
  if (!/^> Prompt version: `[0-9]+\.[0-9]+\.[0-9]+`$/m.test(text)) invalid()
  const matches = [...text.matchAll(/^## (.+)$/gm)]
  // Missing, duplicated, reordered or new sections require explicit routing.
  // Never silently discard newly introduced canonical instructions.
  if (
    matches.length !== headings.length ||
    matches.some((match, index) => match[1] !== headings[index])
  )
    invalid()
  const sections = new Map<Heading, string>()
  for (const [index, match] of matches.entries()) {
    const heading = headings[index]
    if (!heading || match.index === undefined) invalid()
    sections.set(heading, text.slice(match.index, matches[index + 1]?.index).trim())
  }
  const section = (heading: Heading): string => sections.get(heading) ?? invalid()
  const sharedParagraph = (heading: Heading, start: string): string => {
    const content = section(heading)
    const offset = content.indexOf(`\n${start}`)
    if (offset < 0 || content.indexOf(`\n${start}`, offset + 1) >= 0) invalid()
    return content.slice(offset + 1).trim()
  }
  const selected = phaseHeadings[mode] ?? invalid()
  const parts = [
    text.slice(0, matches[0]?.index).trim(),
    section('최우선 원칙'),
    section('MCP 입력 운송 형식'),
  ]
  if (!selected.includes('후보 생성'))
    parts.push(sharedParagraph('후보 생성', '개인적 필요가 입력된 경우에는'))
  if (!selected.includes('Core 도구 사용 순서'))
    parts.push(sharedParagraph('Core 도구 사용 순서', 'tool input에 요구되는 ID와 correlation은'))
  if (mode === 'SPEC')
    parts.push(sharedParagraph('SPEC recovery turn', 'Spec 검토는 낮은 진입장벽을 유지해야 한다.'))
  parts.push(section('표현 방식'), section('금지 사항'))
  // Keep the current operation's exact count/length/submission rules last.
  // Trial A placed generic card-expression guidance after them and produced
  // oversized previews in two native cells; this layout is a new candidate,
  // not a measured latency/quality improvement by itself.
  parts.push(...selected.map(section))
  return `${parts.join('\n\n')}\n`
}
