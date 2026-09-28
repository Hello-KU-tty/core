import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const PERSISTENT_NATIVE_RUNTIME =
  process.platform !== 'darwin' ||
  (typeof __VIBE_PORTABLE_HOST__ !== 'undefined' && __VIBE_PORTABLE_HOST__)
    ? ''
    : join(homedir(), 'Library/Application Support/VibeHelper/NativeExperiment-20260913/runtime')
export const PERSISTENT_NATIVE_RECEIPT = join(
  PERSISTENT_NATIVE_RUNTIME,
  'native-core-receipts.jsonl',
)

export function allowedNativeReceipt(receiptPath, descriptorPath) {
  if (typeof __VIBE_PORTABLE_HOST__ !== 'undefined' && __VIBE_PORTABLE_HOST__) return false
  if (typeof receiptPath !== 'string' || typeof descriptorPath !== 'string') return false
  if (receiptPath.startsWith('/private/tmp/') && resolve(receiptPath) === receiptPath) return true
  return (
    PERSISTENT_NATIVE_RUNTIME !== '' &&
    receiptPath === PERSISTENT_NATIVE_RECEIPT &&
    dirname(resolve(descriptorPath)) === PERSISTENT_NATIVE_RUNTIME
  )
}
