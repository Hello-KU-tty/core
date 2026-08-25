const expectedNode = '24.19.0'
const expectedPnpm = '11.12.0'

const failures = []

if (process.versions.node !== expectedNode) {
  failures.push(`Node.js ${expectedNode} is required; received ${process.versions.node}.`)
}

const packageManagerUserAgent = process.env.npm_config_user_agent ?? ''
if (!packageManagerUserAgent.startsWith(`pnpm/${expectedPnpm} `)) {
  failures.push(
    `pnpm ${expectedPnpm} is required; received ${packageManagerUserAgent || 'unknown'}.`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(`Toolchain OK: Node.js ${expectedNode}, pnpm ${expectedPnpm}\n`)
}
