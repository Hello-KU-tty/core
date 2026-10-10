// Compatibility ranges, not exact pins (2026-10-10). Node must be 24.x because the packaged SQLite
// native module has to match the Core's Node 24 ABI. pnpm must be 11.x for the lockfile, from
// 11.13.1 because pnpm itself blocks the broken 11.12.0 and 11.13.0 releases. `.node-version` and
// `packageManager` name the recommended versions; pnpm 10+ switches to `packageManager` by itself.
const nodeMajor = 24
const minimumPnpm = '11.13.1'

const failures = []
const parse = (version) => (version ?? '').split('.').map(Number)

const [node] = parse(process.versions.node)
if (node !== nodeMajor) {
  failures.push(`Node.js ${nodeMajor}.x is required; received ${process.versions.node}.`)
}

const packageManagerUserAgent = process.env.npm_config_user_agent ?? ''
const pnpmVersion = packageManagerUserAgent.match(/^pnpm\/(\d+\.\d+\.\d+)\s/)?.[1]
const [major = 0, minor = 0, patch = 0] = parse(pnpmVersion)
const [, minMinor, minPatch] = parse(minimumPnpm)
if (
  pnpmVersion === undefined ||
  major !== 11 ||
  minor < minMinor ||
  (minor === minMinor && patch < minPatch)
) {
  failures.push(
    `pnpm ${minimumPnpm} or a later 11.x is required; received ${packageManagerUserAgent || 'unknown'}.`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(`Toolchain OK: Node.js ${process.versions.node}, pnpm ${pnpmVersion}\n`)
}
