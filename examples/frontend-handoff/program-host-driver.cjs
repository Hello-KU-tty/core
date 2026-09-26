// Synthetic installed-extension check; never included in the product package.
const assert = require('node:assert/strict')
const { readFile, writeFile } = require('node:fs/promises')
const { join, basename } = require('node:path')
const { randomUUID } = require('node:crypto')
const vscode = require('vscode')
const { LocalCoreDiscoveryPort } = require('program-port')
exports.activate = async () => {
  if (basename(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '') !== 'workspaces') return
  const config = JSON.parse(await readFile(join(__dirname,'config.json'),'utf8'))
  const previous = await readFile(config.report,'utf8').then(JSON.parse).catch(()=>null)
  if (previous) return // no replay after extension reload or an uncertain response
  const report = { stage:'ACTIVATING', status:'RUNNING', nativeRequests:0 }
  const save = async stage => { report.stage=stage; await writeFile(config.report,JSON.stringify(report)) }
  const unwrap = value => { if (!value.ok) throw new Error(value.error.message.split(':')[0]); return value.value }
  const env = revision => ({correlationId:`corr_${randomUUID()}`,idempotencyKey:`idem_${randomUUID()}`,expectedRevision:revision})
  try {
    await save('ACTIVATING')
    const extension=vscode.extensions.getExtension('vibe-helper.builder-helper-agent-panel')
    assert.ok(extension)
    const api=await extension.activate()
    const host=await api.backend
    await host.prepare();host.assertAgentReady()
    report.host={...host.getStatus(),trusted:vscode.workspace.isTrusted}
    const port=new LocalCoreDiscoveryPort(host.client)
    const originalHistory=await host.client.listProjects()
    assert.equal(originalHistory.projects.length,0)
    report.nativeRequests++;await save('DISCOVERY_PREVIEW')
    const session=unwrap(await port.startDiscovery({projectId:'ignored',input:{learningGoal:'TypeScript discriminated unions and exhaustive state transitions',personalNeed:'A small local decision journal for daily coding choices'}},env(0)))
    report.projectId=session.projectId
    const previews=unwrap(await port.generatePreviewRound({discoverySessionId:session.id},env(session.revision)))
    report.previewCount=previews.previews.length;assert.equal(report.previewCount,10)
    const target={candidateId:previews.previews[0].candidateId,revision:1}
    report.nativeRequests++;await save('JIT_AND_SELECT')
    unwrap(await port.submitFeedback({discoverySessionId:session.id,feedback:{id:`feedback_${randomUUID()}`,intent:'SELECT',targets:[target]}},env(session.revision)))
    report.nativeRequests++;await save('SPEC')
    const spec=unwrap(await port.generateSpecDraft({projectId:session.projectId,selectedCandidate:target},env(0)))
    report.initialSpecRevision=spec.revision
    report.nativeRequests++;await save('REFINE_SPEC')
    const refined=unwrap(await port.refineSpec({projectId:session.projectId,learningSpecId:spec.id,message:'Keep the first version local, with a single clear state transition example and no sign-in.'},env(spec.revision)))
    report.refinedSpecRevision=refined.revision;assert.ok(refined.revision>spec.revision)
    await save('CONFIRM_AND_PREPARE_TASK')
    const confirmed=unwrap(await port.confirmSpec({projectId:session.projectId,learningSpecId:spec.id},env(refined.revision)))
    const task=unwrap(await port.prepareBuilderTask({projectId:session.projectId,learningSpecId:spec.id},env(confirmed.revision)))
    assert.equal(task.projectId,session.projectId)
    report.taskReady=task.status==='READY'
    const before=await host.client.listRuns(session.projectId)
    const restored=new LocalCoreDiscoveryPort(host.client)
    const history=unwrap(await restored.listProjects(20,env(0)))
    const snapshot=unwrap(await restored.restoreProject(session.projectId,env(0)))
    assert.equal(history.projects.length,1);assert.equal(snapshot.projectId,session.projectId)
    assert.equal((await host.client.listRuns(session.projectId)).length,before.length)
    report.historyReadOnly=true
    report.runs=before.map(run=>({kind:run.kind,phase:run.phase,status:run.status,outcome:run.outcome,errorCode:run.errorCode}))
    report.status='PASS';await save('COMPLETE')
  } catch(error) {
    report.status='FAIL';report.errorCode=/^[A-Z][A-Z0-9_]{0,99}$/.test(error.message)?error.message:'PROGRAM_HOST_CHECK_FAILED'
    await save(report.stage)
  }
}
