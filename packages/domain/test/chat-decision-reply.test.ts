import { describe, expect, it } from 'vitest'
import { findExplicitOptionMentions, parseChatDecisionReply } from '../src/index.ts'

const request = {
  options: [
    { id: 'decision_option_1h', label: '1 hour' },
    { id: 'decision_option_24h', label: '24 hours' },
    { id: 'decision_option_7d', label: '7 days' },
  ],
  recommendedOptionId: 'decision_option_24h',
} as unknown as Parameters<typeof parseChatDecisionReply>[0]

describe('parseChatDecisionReply', () => {
  it('reads an explicit Korean option number and keeps the learner text as rationale', () => {
    expect(
      parseChatDecisionReply(
        request,
        '2번 24시간으로 할게. 공유받은 친구가 보통 하루 안에는 열어보니까, 너무 짧으면 다시 보내야 해서 불편해.',
      ),
    ).toEqual({
      kind: 'RESOLVED',
      selectionKind: 'OPTION',
      selectedOptionId: 'decision_option_24h',
      rationale:
        '24시간으로 할게. 공유받은 친구가 보통 하루 안에는 열어보니까, 너무 짧으면 다시 보내야 해서 불편해.',
    })
  })

  it.each([
    ['3.', 'decision_option_7d', undefined],
    ['1) 민감한 파일이라서', 'decision_option_1h', '민감한 파일이라서'],
    ['옵션 3: 협업용이라', 'decision_option_7d', '협업용이라'],
    ['option 1, short is safer', 'decision_option_1h', 'short is safer'],
    ['2번으로 할게', 'decision_option_24h', '할게'],
    ['  2  ', 'decision_option_24h', undefined],
  ])('accepts the explicit selector in %j', (reply, optionId, rationale) => {
    const parsed = parseChatDecisionReply(request, reply)
    expect(parsed).toMatchObject({
      kind: 'RESOLVED',
      selectionKind: 'OPTION',
      selectedOptionId: optionId,
    })
    expect(parsed.kind === 'RESOLVED' ? parsed.rationale : 'unresolved').toBe(rationale)
  })

  it('maps an explicit recommendation reply to the recommended option', () => {
    expect(parseChatDecisionReply(request, '추천대로 할게. 무난해 보여서')).toEqual({
      kind: 'RESOLVED',
      selectionKind: 'RECOMMENDATION',
      selectedOptionId: 'decision_option_24h',
      rationale: '할게. 무난해 보여서',
    })
  })

  it.each([
    '24시간으로 해줘',
    '2시간으로 하면 어때?',
    '2 hours please',
    '추천하는 이유가 뭐야?',
    '잘 모르겠어, 차이를 설명해줘',
    '',
  ])('does not guess a selection from %j', (reply) => {
    expect(parseChatDecisionReply(request, reply)).toEqual({
      kind: 'UNRESOLVED',
      reason: 'NO_EXPLICIT_SELECTION',
    })
  })

  it('rejects an option number that does not exist', () => {
    expect(parseChatDecisionReply(request, '5번')).toEqual({
      kind: 'UNRESOLVED',
      reason: 'OPTION_OUT_OF_RANGE',
    })
  })

  it('leaves an over-long rationale unresolved instead of truncating the learner text', () => {
    expect(parseChatDecisionReply(request, `1번 ${'이유 '.repeat(1_500)}`)).toEqual({
      kind: 'UNRESOLVED',
      reason: 'RATIONALE_TOO_LONG',
    })
  })
})

describe('findExplicitOptionMentions', () => {
  it.each([
    [['2시간(1번)으로 할게'], ['decision_option_1h']],
    [['음… 옵션 3이 좋겠어'], ['decision_option_7d']],
    [['2. 하루면 충분해'], ['decision_option_24h']],
    [['1번이랑 2번 고민했는데 2번'], ['decision_option_1h', 'decision_option_24h']],
    [['24시간으로 하자', '2 hours면 짧아'], []],
    [['12번 줄 코드가 이상해'], []],
    [['9번'], []],
  ])('finds explicit numbered choices in %j', (messages, expected) => {
    expect(findExplicitOptionMentions(request, messages)).toEqual(expected)
  })
})
