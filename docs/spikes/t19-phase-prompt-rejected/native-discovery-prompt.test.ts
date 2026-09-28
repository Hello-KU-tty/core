import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { composeNativeDiscoveryPrompt } from './native-discovery-prompt.js'

const canonical = await readFile(
  new URL('../../agent-prompts/discovery.md', import.meta.url),
  'utf8',
)
const modes = [
  'PREVIEW',
  'ENRICH_FIRST',
  'ENRICH_SECOND',
  'ENRICH_SELECTED',
  'ROUND',
  'MERGE',
  'SPEC',
  'SPEC_RECOVERY',
]

describe('native Discovery phase prompts', () => {
  it.each(modes)('keeps canonical safety, provenance and source text for %s', (mode) => {
    const prompt = composeNativeDiscoveryPrompt(canonical, mode)
    expect(prompt).toContain(canonical.match(/^> Prompt version: .+$/m)?.[0])
    for (const rule of [
      '사용자가 명시적으로 프로젝트를 확정할 때까지',
      '누락된 의미값은 추측하거나 기본값으로 채우지 마라',
      'OBSERVED`를 사용자의 이해 증거로 과장하지 마라',
      'NO_RELEVANT_EVIDENCE',
      '명시된 과거 프로젝트의 accepted Evidence만',
      '직접 데이터베이스를 수정하지 마라',
      '사용자의 선택 없이 프로젝트 확정',
      'timestamp, source, input snapshot처럼 adapter가 소유한 metadata',
    ])
      expect(prompt).toContain(rule)
    for (const line of prompt.trim().split('\n')) expect(canonical).toContain(line)
    expect(prompt.length).toBeLessThan(canonical.length * 0.8)
    expect(composeNativeDiscoveryPrompt(canonical.replaceAll('\n', '\r\n'), mode)).toBe(prompt)
  })

  it('removes conflicting phases without removing the selected phase contracts', () => {
    const preview = composeNativeDiscoveryPrompt(canonical, 'PREVIEW')
    expect(preview).toContain('lightweight preview를 정확히 10개')
    expect(preview).toContain('같은 CRUD 구조에 이름과 테마만 바꾼 preview를 만들지 마라')
    expect(preview).not.toContain('완성 후보 4개')
    expect(preview).not.toContain('## 빠른 SPEC turn')
    expect(preview.lastIndexOf('## ')).toBe(preview.indexOf('## 빠른 PREVIEW turn'))
    for (const mode of modes.filter((value) => value.startsWith('ENRICH_'))) {
      const enrichment = composeNativeDiscoveryPrompt(canonical, mode)
      expect(enrichment).toContain('위 여섯 preview 필드는 아예 넣지 마라')
      expect(enrichment).toContain('requestedPreviews`에 있는 수만큼만')
      expect(enrichment).not.toContain('## 빠른 PREVIEW turn')
      expect(enrichment.lastIndexOf('## ')).toBe(enrichment.indexOf('## ENRICHMENT turn'))
    }
    const spec = composeNativeDiscoveryPrompt(canonical, 'SPEC')
    expect(spec).toContain('이 Agent에 보이는 유일한 Core tool')
    expect(spec).toContain('expectedSpecRevision=0')
    expect(spec).toContain('Spec 검토는 낮은 진입장벽')
    expect(spec).not.toContain('## SPEC recovery turn')
    expect(spec.lastIndexOf('## ')).toBe(spec.indexOf('## 빠른 SPEC turn'))
    const recovery = composeNativeDiscoveryPrompt(canonical, 'SPEC_RECOVERY')
    expect(recovery).toContain('get_discovery_context`를 정확히 한 번 호출')
    expect(recovery).not.toContain('이 Agent에 보이는 유일한 Core tool')
    expect(composeNativeDiscoveryPrompt(canonical, 'ROUND')).toContain('carriedCandidates')
    expect(composeNativeDiscoveryPrompt(canonical, 'MERGE')).toContain(
      'Core가 pending MERGE에서 계산',
    )
  })

  it('fails closed for source drift and unrecognized phases', () => {
    for (const source of [
      canonical.replace('## 최우선 원칙', '## Unknown'),
      canonical.replace('## 최우선 원칙', '## 최우선 원칙\n\n## 최우선 원칙'),
      `${canonical}\n## New safety rule\nDo not lose me.`,
      canonical.replace('Prompt version:', 'Missing version:'),
      canonical.replace('개인적 필요가 입력된 경우에는', 'Different shared section'),
    ])
      expect(() => composeNativeDiscoveryPrompt(source, 'PREVIEW')).toThrow(
        'NATIVE_DISCOVERY_PROMPT_INVALID',
      )
    for (const mode of ['', 'BUILDER', '__proto__', 'toString', 'preview'])
      expect(() => composeNativeDiscoveryPrompt(canonical, mode)).toThrow(
        'NATIVE_DISCOVERY_MODE_INVALID',
      )
  })
})
