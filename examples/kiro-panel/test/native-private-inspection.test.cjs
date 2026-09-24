const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, win32 } = require('node:path')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')
const source = readFileSync(join(__dirname, '../../kiro-native-host/native-private-directory.cjs'), 'utf8')

function inspect(result) {
  const module = { exports: {} }
  runInNewContext(source, { module, process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } },
    require: name => {
      if (name === 'node:path') return win32
      if (name === 'node:fs') return { realpathSync: path => path,
        lstatSync: () => ({ isDirectory: () => true, isFile: () => true, isSymbolicLink: () => false, nlink: 1 }) }
      if (name === 'node:child_process') return { execFileSync: (_file, _args, options) => {
        assert.equal(options.timeout, 30000)
        if (result instanceof Error) throw result
        return result
      } }
      throw new Error('UNEXPECTED_IMPORT')
    },
  })
  return module.exports.privateNativeDirectory('C:\\synthetic')
}
test('native ACL inspection distinguishes unsafe from unavailable without allowing either', () => {
  assert.equal(inspect('PRIVATE\r\n'), true)
  assert.equal(inspect('UNSAFE\r\n'), false)
  for (const result of ['', 'PRIVATE\nUNSAFE', new Error('ETIMEDOUT')])
    assert.throws(() => inspect(result), /NATIVE_PRIVATE_PATH_CHECK_UNAVAILABLE/)
})
