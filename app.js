const app = require('express')();
const ghsync = require('./github-sync.js');

var port = 3000
var config = JSON.parse(process.env.config);
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
  const promise = ghsync(configJson);
  promise
    .then(function(response) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(response));
      })
    .catch(function(response) {
        console.log(JSON.stringify(response));
        res.statusCode = 500;
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify({ 'error' : response}));
      });
});

// Comment out if not using appsody to run it
// app.listen(port, () => {
//   console.log(`Example app listening at http://localhost:${port}`)
// })

module.exports.app = app;
