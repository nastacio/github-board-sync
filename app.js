const app = require('express')();
const ghsync = require('./github-sync.js');

var config                 = JSON.parse(process.env.config);
var configJson = {
  github_pat: config.github_pat,
  sources_global_github_pat : ("sources_global_github_pat" in config) ? config.sources_global_github_pat : config.github_pat,
  target_repo: config.target_repo,
  source_repos: config.source_repos
}

/**
 * Main REST method.
 */
app.get('/', (req, res) => {
  var jsonResponse = ghsync(configJson);
  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify(jsonResponse));
});
 
module.exports.app = app;
