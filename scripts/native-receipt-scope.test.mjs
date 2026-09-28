import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  allowedNativeReceipt,
  PERSISTENT_NATIVE_RECEIPT,
  PERSISTENT_NATIVE_RUNTIME,
} from './native-receipt-scope.mjs'

test('only the exact persistent experiment receipt beside its binding is allowed', () => {
  const binding = `${PERSISTENT_NATIVE_RUNTIME}/native-binding-native_123.json`
  // This legacy receipt remains scoped to the same fixed Mac experiment folder.
  assert.equal(
    allowedNativeReceipt(PERSISTENT_NATIVE_RECEIPT, binding),
    process.platform === 'darwin',
  )
  assert.equal(allowedNativeReceipt('/private/tmp/native-run/receipt.jsonl', binding), true)
  assert.equal(allowedNativeReceipt(`${PERSISTENT_NATIVE_RUNTIME}/other.jsonl`, binding), false)
  assert.equal(
    allowedNativeReceipt(`${PERSISTENT_NATIVE_RUNTIME}/nested/native-core-receipts.jsonl`, binding),
    false,
  )
  assert.equal(
    allowedNativeReceipt(
      PERSISTENT_NATIVE_RECEIPT,
      '/private/tmp/native-run/native-binding-native_123.json',
    ),
    false,
  )
  assert.equal(
    allowedNativeReceipt(
      PERSISTENT_NATIVE_RECEIPT,
      `${PERSISTENT_NATIVE_RUNTIME}/nested/native-binding-native_123.json`,
    ),
    false,
  )
  assert.equal(
    allowedNativeReceipt(
      join(homedir(), 'Library/Application Support/VibeHelper/other.jsonl'),
      binding,
    ),
    false,
  )
})

test('legacy runtime resolves the current home without broadening the fixed subdirectory', () => {
  assert.equal(
    PERSISTENT_NATIVE_RUNTIME,
    process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support/VibeHelper/NativeExperiment-20260913/runtime')
      : '',
  )
})

test('temporary receipt spelling cannot escape its approved lexical root', () => {
  for (const receipt of [
    '/private/tmp/../outside.jsonl',
    '/private/tmp/./receipt.jsonl',
    '/private/tmp/nested/../../outside.jsonl',
    '/private/tmp//receipt.jsonl',
    '/private/tmp2/receipt.jsonl',
    'native-core-receipts.jsonl',
  ])
    assert.equal(allowedNativeReceipt(receipt, '/private/tmp/native-run/binding.json'), false)
})
