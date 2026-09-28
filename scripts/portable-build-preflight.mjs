import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const licenseSha256 = '148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// Build-time source check, not a new runtime/platform support policy. The caller
// supplies the existing MANAGED_NODE pin; there is no environment/CLI pin override.
export async function verifyPortableBuildSource(executable, expectedNodeSha256, nodeLicense) {
  if (!/^[0-9a-f]{64}$/.test(expectedNodeSha256)) throw new Error('NODE_DISTRIBUTION_PIN_INVALID')
  if (sha256(await readFile(executable)) !== expectedNodeSha256)
    throw new Error('NODE_DISTRIBUTION_UNVERIFIED')
  const licensePath = nodeLicense ? resolve(nodeLicense) : join(dirname(executable), 'LICENSE')
  const info = await lstat(licensePath)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('PACKAGE_SOURCE_FILE_UNSAFE')
  // Preserve the existing policy: an explicit sidecar must be the exact official
  // license. The default is the regular LICENSE beside the verified distribution.
  if (nodeLicense && sha256(await readFile(licensePath)) !== licenseSha256)
    throw new Error('NODE_DISTRIBUTION_LICENSE_UNVERIFIED')
  return licensePath
}
