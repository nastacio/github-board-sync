const app = require('express')()
const ghsync = require('./github-sync.js')

var port = 3000
var config = JSON.parse(process.env.config)
var configJson = {
  github_pat: config.github_pat,
  sources_global_github_pat : ("sources_global_github_pat" in config) ? config.sources_global_github_pat : config.github_pat,
  target_repo: config.target_repo,
  source_repos: config.source_repos
}

/**
 * Main method.
 */
async function ghSync(config) {
  const promise = ghsync(configJson)
  promise
    .then(function(response) {
        console.log("INFO: Sync complete.")
      })
    .catch(function(response) {
        console.log("ERROR: Sync failed.")
      })
}
ghSync(config)
