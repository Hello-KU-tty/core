// Apply only to the reviewed program files. Modified files are never overwritten.
import { execFile } from 'node:child_process'
import { cp, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { inventory, sha256 } from './archive.mjs'
const kit=dirname(fileURLToPath(import.meta.url))
const program=await realpath(resolve(process.argv[2]??''))
const check=process.argv.includes('--check')
const manifest=JSON.parse(await readFile(join(kit,'manifest.json'),'utf8'))
// Validate the kit before touching the target; manifest is shipped with a separate archive hash.
for(const [name, expected] of Object.entries(manifest.files)) {
  const path=resolve(kit,name)
  if(!path.startsWith(kit+sep) || (await lstat(path)).isSymbolicLink() || sha256(await readFile(path))!==expected.sha256) throw new Error('KIT_HASH_MISMATCH')
}
for(const [name, expected] of Object.entries(manifest.programBaseFiles)) {
  const path=join(program,name)
  if(await realpath(path)!==path || sha256((await readFile(path,'utf8')).replaceAll('\r\n','\n'))!==expected) throw new Error(`PROGRAM_FILE_CHANGED: ${name}; apply program.patch manually after review`)
}
for(const target of ['portable','vendor/frontend-host']) {
  try { await lstat(join(program,target)); throw new Error(`TARGET_ALREADY_EXISTS: ${target}`) }
  catch(error) { if(error.code!=='ENOENT') throw error }
}
// Existing vendored SDK must exactly match the reviewed inventory, ignoring line endings for text.
const vendor=join(program,'vendor/frontend-client')
const existing=await inventory(vendor)
if(existing.length!==Object.keys(manifest.programSdkFiles).length) throw new Error('PROGRAM_SDK_MODIFIED')
for(const file of existing) if(sha256((await readFile(join(vendor,file.name),'utf8')).replaceAll('\r\n','\n'))!==manifest.programSdkFiles[file.name]) throw new Error('PROGRAM_SDK_MODIFIED')
const git=process.env.VIBE_HANDOFF_GIT??'git'
const run=promisify(execFile)
const gitOptions={cwd:program,windowsHide:true,env:{...process.env,GIT_CEILING_DIRECTORIES:dirname(program)}}
await run(git,['apply','--check',join(kit,'program.patch')],gitOptions)
if(check) { console.log('READY: reviewed program files and kit hashes match; no files changed.'); process.exit(0) }
// Entire preflight above completes before mutation. No network, install scripts or credential operations.
await run(git,['apply',join(kit,'program.patch')],gitOptions)
for(const [name, expected] of Object.entries(manifest.programPatchedFiles))
  if(sha256((await readFile(join(program,name),'utf8')).replaceAll('\r\n','\n'))!==expected) throw new Error('PROGRAM_PATCH_RESULT_MISMATCH')
for(const target of ['portable','vendor/frontend-host','vendor/frontend-client']) {
  await mkdir(dirname(join(program,target)),{recursive:true})
  await cp(join(kit,target),join(program,target),{recursive:true})
}
console.log('APPLIED: managed host + program patch. Run npm ci --ignore-scripts, npm run typecheck, npm test, npm run build; then package-program.mjs.')
