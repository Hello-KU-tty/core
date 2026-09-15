const test = require('node:test')
const assert = require('node:assert/strict')
const { HAIKU_ID, SONNET_ID, createNativeAnalystModelVariant } =
  require('../src/native-analyst-model-variant.cjs')

const scope = { projectId: 'project_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspace: '/private/tmp/synthetic-w' }

test('default stays Haiku; explicit variant applies only to one Project/workspace', () => {
  const variant = createNativeAnalystModelVariant()
  assert.equal(variant.modelFor(scope), HAIKU_ID)
  assert.equal(variant.armSonnet(scope), SONNET_ID)
  assert.equal(variant.modelFor(scope), SONNET_ID)
  assert.throws(() => variant.modelFor({ ...scope, workspace: '/private/tmp/other' }),
    /NATIVE_ANALYST_VARIANT_PROJECT_MISMATCH/)
  assert.throws(() => variant.modelFor({ ...scope,
    projectId: 'project_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
  /NATIVE_ANALYST_VARIANT_PROJECT_MISMATCH/)
  assert.throws(() => variant.armSonnet(scope), /NATIVE_ANALYST_VARIANT_SCOPE_INVALID/)
  assert.equal(createNativeAnalystModelVariant().modelFor(scope), HAIKU_ID)
})
