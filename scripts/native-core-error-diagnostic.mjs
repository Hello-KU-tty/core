const KNOWN_FIELDS = Object.freeze([
  'productPurpose',
  'targetUsers',
  'primaryUsageMoment',
  'successMoment',
  'mvpFeatures',
  'scope',
  'expectedDecisions',
  'runtimeConstraint',
  'deploymentConstraints',
  'conceptNames',
  'category',
  'description',
  'whyUserInputMatters',
  'appliedFeedbackIds',
  'carriedCandidates',
  'activeDecisionIds',
  'relatedFiles',
  'stage',
  'stageHints',
  '_meta',
  'actor',
  'kind',
  'blockingReason',
  'recommendedOptionKey',
  'expectedContextVersion',
])

export function describeNativeCoreError(result) {
  const errorText =
    result?.isError === true && Array.isArray(result.content)
      ? result.content
          .filter((item) => item?.type === 'text' && typeof item.text === 'string')
          .map((item) => item.text)
          .join(' ')
          .slice(0, 8192)
      : ''
  return {
    errorMentions: KNOWN_FIELDS.filter((field) => errorText.includes(field)),
    errorKind: /unrecognized_keys|unrecognized key/i.test(errorText)
      ? 'SCHEMA_UNKNOWN_FIELDS'
      : /invalid_type|undefined|required/i.test(errorText)
        ? 'SCHEMA_SHAPE'
        : /stale|revision/i.test(errorText)
          ? 'STALE'
          : 'OTHER',
  }
}
