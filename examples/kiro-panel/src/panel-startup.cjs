const { basename, dirname } = require('node:path')

// Both inputs have already passed realpath. Core projects are two levels below
// the generated root; Helper hosts must remain separate and quiet.
function shouldOpenGeneratedPanel(workspace, generatedRoot) {
  return workspace === generatedRoot ||
    (dirname(dirname(workspace)) === generatedRoot &&
      basename(dirname(workspace)) === 'projects' &&
      /^project_[A-Za-z0-9_-]+$/.test(basename(workspace)))
}

module.exports = { shouldOpenGeneratedPanel }
