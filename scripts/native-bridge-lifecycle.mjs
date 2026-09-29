// Fixed, once-per-process stderr markers; never descriptors, paths, tokens or tool input.
const STAGES = new Set([
  'PROCESS_STARTED',
  'BINDING_VALIDATED',
  'CORE_CONNECTING',
  'CORE_CONNECTED',
  'CORE_TOOLS_LISTED',
  'CORE_CATALOG_VERIFIED',
  'STDIO_READY',
  'STDIO_INITIALIZED',
  'STDIO_TOOLS_LISTED',
  'CLOSED',
])
export function createBridgeLifecycle(write = (line) => process.stderr.write(line)) {
  const seen = new Set()
  let last = 'PROCESS_STARTED'
  return {
    stage(stage) {
      if (!STAGES.has(stage) || seen.has(stage)) return
      seen.add(stage)
      last = stage
      write(`BRIDGE_STAGE_${stage}\n`)
    },
    failed() {
      if (seen.has('FAILED')) return
      seen.add('FAILED')
      write(`BRIDGE_FAILED_AFTER_${last}\n`)
    },
  }
}
