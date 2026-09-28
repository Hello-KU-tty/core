// Summarize saved synthetic reports only: no Kiro calls and no runtime writes.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { requireUnusedBenchmarkReport } from './native-benchmark-prompt-metadata.mjs'

const [reportRoot, outputFile] = process.argv.slice(2)
if (!reportRoot || !outputFile) throw new Error('NATIVE_SUMMARY_ARGUMENTS_REQUIRED')
await requireUnusedBenchmarkReport(resolve(outputFile))
const rows = []
for (const filename of await readdir(resolve(reportRoot))) {
  if (!/^native-[a-z0-9-]+\.json$/.test(filename)) continue
  const report = JSON.parse(await readFile(join(resolve(reportRoot), filename), 'utf8'))
  if (
    ![
      'SYNTHETIC_ACTUAL_PROGRAM_NATIVE_ACTION',
      'SYNTHETIC_ACTUAL_PROGRAM_NATIVE_BUILD_ACTION',
    ].includes(report.kind)
  )
    continue
  const receipts = report.receipts ?? []
  const previewLimits = {
    title: 16,
    summary: 45,
    coreInteraction: 45,
    appeal: 35,
    technologyNecessity: 45,
  }
  const previews = report.action === 'preview' ? report.value?.previews : undefined
  const oversizeFields = []
  if (Array.isArray(previews))
    for (const [index, preview] of previews.entries())
      for (const [field, limit] of Object.entries(previewLimits))
        if (typeof preview[field] === 'string' && preview[field].length > limit)
          oversizeFields.push({
            position: index + 1,
            field,
            actualUtf16Length: preview[field].length,
            limit,
          })
  const toolRequests = {}
  for (const item of receipts)
    if (item.event === 'CORE_TOOL_REQUESTED')
      toolRequests[item.toolName] = (toolRequests[item.toolName] ?? 0) + 1
  rows.push({
    report: basename(filename),
    startedAt: report.startedAt,
    action: report.action,
    fixture: report.fixture ?? 'unions',
    turnStatus: report.status,
    ...(report.errorCode ? { errorCode: report.errorCode } : {}),
    durationMs: Math.round(report.durationMs),
    firstTextMs: report.timers?.firstTextMs ?? report.timings?.firstTextMs ?? null,
    nativePrompts: report.nativePrompts ?? [],
    phases: (report.runs ?? (report.run ? [report.run] : [])).map((run) => run.phase),
    toolRequests,
    bridgeRejections: receipts
      .filter((item) => item.event?.includes('REJECTED'))
      .map((item) => ({ event: item.event, code: item.code })),
    coreErrors: receipts
      .filter((item) => item.event === 'CORE_TOOL_RESULT' && item.isError)
      .map((item) => ({ tool: item.toolName, code: item.errorCode })),
    ...(report.afterTask
      ? {
          taskStatus: report.afterTask.status,
          durableTaskCompleted: report.afterTask.status === 'COMPLETED',
        }
      : {}),
    ...(Array.isArray(previews)
      ? {
          previewFormat: {
            scope: 'DETERMINISTIC_PROMPT_FORMAT_ONLY_NOT_SEMANTIC_QUALITY',
            count: previews.length,
            exactCount: previews.length === 10,
            serializedChars: JSON.stringify(previews).length,
            oversizeFieldCount: oversizeFields.length,
            oversizeFields,
          },
        }
      : {}),
  })
}
rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
await writeFile(
  resolve(outputFile),
  `${JSON.stringify({ kind: 'SYNTHETIC_NATIVE_BENCHMARK_SUMMARY', generatedAt: new Date().toISOString(), rows }, null, 2)}\n`,
  { mode: 0o600, flag: 'wx' },
)
console.log(
  JSON.stringify(
    {
      reportCount: rows.length,
      rows: rows.map(
        ({
          report,
          action,
          turnStatus,
          durationMs,
          taskStatus,
          bridgeRejections,
          previewFormat,
        }) => ({
          report,
          action,
          turnStatus,
          durationMs,
          ...(taskStatus ? { taskStatus } : {}),
          bridgeRejections: bridgeRejections.length,
          ...(previewFormat ? { oversizeFields: previewFormat.oversizeFieldCount } : {}),
        }),
      ),
    },
    null,
    2,
  ),
)
