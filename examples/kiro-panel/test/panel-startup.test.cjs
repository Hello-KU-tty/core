const assert = require('node:assert/strict')
const { test } = require('node:test')
const { join, resolve } = require('node:path')
const { shouldOpenGeneratedPanel } = require('../src/panel-startup.cjs')

test('Discovery root and a Core project reopen the panel after workspace navigation', () => {
  const root = resolve('합성 사용자', 'core-data', 'workspaces')
  assert.equal(shouldOpenGeneratedPanel(root, root), true)
  assert.equal(shouldOpenGeneratedPanel(join(root, 'projects', 'project_synthetic'), root), true)
})

test('Helper hosts, arbitrary folders and nested project files do not auto-open a panel', () => {
  const root = resolve('합성 사용자', 'core-data', 'workspaces')
  for (const folder of [
    join(root, '__vibe-native-helper-synthetic'), join(root, 'projects'),
    join(root, 'unrelated'), join(root, 'projects', 'other'),
    join(root, 'projects', 'project_synthetic', 'src'),
    join(`${root}-sibling`, 'projects', 'project_synthetic'),
  ]) assert.equal(shouldOpenGeneratedPanel(folder, root), false, folder)
})
