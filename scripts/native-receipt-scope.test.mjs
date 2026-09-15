import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allowedNativeReceipt,
  PERSISTENT_NATIVE_RECEIPT,
  PERSISTENT_NATIVE_RUNTIME,
} from './native-receipt-scope.mjs'

test('only the exact persistent experiment receipt beside its binding is allowed', () => {
  const binding = `${PERSISTENT_NATIVE_RUNTIME}/native-binding-native_123.json`
  assert.equal(allowedNativeReceipt(PERSISTENT_NATIVE_RECEIPT, binding), true)
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
      '/Users/hurdoo/Library/Application Support/VibeHelper/other.jsonl',
      binding,
    ),
    false,
  )
})
