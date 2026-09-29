import assert from 'node:assert/strict'
import test from 'node:test'
import { createBridgeLifecycle } from './native-bridge-lifecycle.mjs'
test('emits finite lifecycle stages once without logging caller content', () => {
  const lines = []
  const lifecycle = createBridgeLifecycle((line) => lines.push(line))
  for (const stage of [
    'PROCESS_STARTED',
    'BINDING_VALIDATED',
    'CORE_CONNECTING',
    'CORE_CONNECTED',
    'CORE_TOOLS_LISTED',
    'CORE_CATALOG_VERIFIED',
    'STDIO_READY',
    'STDIO_INITIALIZED',
    'STDIO_TOOLS_LISTED',
  ]) {
    lifecycle.stage(stage)
    lifecycle.stage(stage)
  }
  lifecycle.stage('/private/synthetic-token')
  lifecycle.failed()
  lifecycle.failed()
  assert.equal(lines.length, 10)
  assert.equal(lines.at(-1), 'BRIDGE_FAILED_AFTER_STDIO_TOOLS_LISTED\n')
  assert.equal(
    lines.some((line) => line.includes('synthetic-token')),
    false,
  )
})
test('distinguishes HTTP connection failure from waiting for IDE tools/list', () => {
  for (const stage of ['CORE_CONNECTING', 'STDIO_READY', 'STDIO_INITIALIZED']) {
    const lines = []
    const lifecycle = createBridgeLifecycle((line) => lines.push(line))
    lifecycle.stage('PROCESS_STARTED')
    lifecycle.stage(stage)
    lifecycle.failed()
    assert.equal(lines.at(-1), `BRIDGE_FAILED_AFTER_${stage}\n`)
  }
})
