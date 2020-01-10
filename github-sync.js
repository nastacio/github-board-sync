// github-sync.js
// ==============

const rp = require('request-promise');
const parse = require('parse-link-header');

const GITHUB_USER_AGENT = 'github-board-sync';
const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json';
const GITHUB_CONTENT_TYPE_HEADER = GITHUB_ACCEPT_HEADER;
const GITHUB_ACCEPT_PREVIEW_HEADER = 'application/vnd.github.inertia-preview+json';

// Added to issues created and managed by this tool
const GITHUB_REMOTE_LABEL = "remote";

/**
 * 
 */
var sync = function(config) {

    var githubPat              = config.github_pat;
    var sourcesGlobalGithubPat = ("sources_global_github_pat" in config) ? config.sources_global_github_pat : githubPat;
    var targetRepo             = config.target_repo;
    var sourceRepos            = config.source_repos;

    var promisedResponses=[];  

    var existingIssues = [];
    const initialTargetRepo = targetRepo + '/issues?state=all&labels=' + GITHUB_REMOTE_LABEL;
    var existingIssuePromise = getExistingIssues(initialTargetRepo, githubPat, existingIssues);
    promisedResponses.push(existingIssuePromise);

    var getLabelPromise = createLabelIfNeeded(targetRepo, githubPat);
    promisedResponses.push(getLabelPromise);

    var projectUrl = null;
    var listProjectsOptions = {
      url: targetRepo + '/projects',
      json: true,
      headers: {
        'User-Agent': GITHUB_USER_AGENT,
        'Accept': GITHUB_ACCEPT_PREVIEW_HEADER,
        'Authorization': 'token ' + githubPat
      }
    };
    var getProjectUrlPromise = rp
      .get(listProjectsOptions)
      .promise()
      .then(function (body) {
        var keys = Object.keys(body);
        for (var i = 0, length = keys.length; i < length; i++) {
          project = body[keys[i]];
          if (project.name === 'Main') {
            projectUrl = project.url;
          }
        }
        console.log("Retrieved project url: " + project.url);
      })
      .catch(function (err) {
        console.log("Error " + err);
      });
    promisedResponses.push[getProjectUrlPromise];
    
    var sourceIssues = [];
    var sourceIssuesUrl = [];
    getSourceIssues(sourceRepos, sourcesGlobalGithubPat, sourceIssuesUrl, sourceIssues, promisedResponses);

    Promise
      .all(promisedResponses)
      .then(function(values) {
        console.log("existing:" + existingIssues.length);
        console.log("sourceIssues:" + sourceIssues.length);
        console.log("projectUrl:" + projectUrl);

        patchExistingIssues(targetRepo, githubPat, existingIssues, sourceIssues);

        createMissingIssues(targetRepo, githubPat, sourceIssues, existingIssues);

        var jsonResponse = {
          targetProjectUrl: projectUrl,
          existingIssuesCount: existingIssues.length,
          sourceIssuesCount: sourceIssues.length,
          existingIssues: existingIssues
                            .sort((i1,i2) => i1.title < i2.title)
                            .map(issue => { return { title: issue.title, url: issue.url, state: issue.state } } ),
        }
        return jsonResponse;
      })
      .catch(function (err) {
        console.log("Error in promises: " + err);
        throw err;
      });
  }


/**
 * New body for an issue in the target repo
 * 
 * @param {Object} sourceIssue a GitHub issue, according to https://developer.github.com/v3/issues/
 */
function createNewIssueBody(sourceIssue) {
  return "Aggregated from: " + sourceIssue.url + "\n\nDescription in source issue:\n\n" + sourceIssue.body;
}

/**
 * First part of the title for an issue in the target repo.
 * 
 * @param {Object} sourceIssue a GitHub issue, according to https://developer.github.com/v3/issues/
 */
function getSourceIssuePrefix(sourceIssue) {
  return "[" + sourceIssue.prefix + " - " + sourceIssue.issue.number + "]";
}


/**
 * Complete title for an issue in the target repo.
 * 
 * @param {Object} sourceIssue a GitHub issue, according to https://developer.github.com/v3/issues/
 */
function getIssueTitle(sourceIssue) {
  return getSourceIssuePrefix(sourceIssue) + " " + sourceIssue.issue.title;
}


/**
 * Query source repositories for all existing issues
 * 
 * @param {string} targetRepo GitHub URI for the target repository, such as https://api.github.com/repos/orgname/reponame
 * @param {Object[]} existingIssues destination array of GitHub issues to be queried from the target repository
 */
async function getExistingIssues(targetRepo, githubPat, existingIssues) {
  const checkIfDuplicateOptions = {
    url: targetRepo,
    json: true,
    resolveWithFullResponse: true,
    headers: {
      'User-Agent': GITHUB_USER_AGENT,
      'Accept': GITHUB_ACCEPT_HEADER,
      'Authorization': 'token ' + githubPat,
      'Cache-Control': 'no-cache'
    }
  };

  console.log("Processing page: " + targetRepo);
  const checkDuplicatesGet = await rp
    .get(checkIfDuplicateOptions)
    .promise()
    .then(function (response) {
      var body = response.body;
      var keys = Object.keys(body);
      for (var i = 0, length = keys.length; i < length; i++) {
        issue = body[keys[i]];

        if (existingIssues.filter(matchesIssueNumber()).length === 0) {
          existingIssues.push(issue);
        }
      }

      linkHeader = response.headers.link;
      console.log(response.headers.link);
      if (linkHeader) {
        var parsed = parse(linkHeader);
        if (parsed.next) {
            console.log("Next existing issues page: " + parsed.next.url);
            return getExistingIssues(parsed.next.url, githubPat, existingIssues);
        }
      }
    })
  return checkDuplicatesGet;

  function matchesIssueNumber() {
    return function (existingIssue) { return existingIssue.number === issue.number; };
  }
}


/**
 * Returns the entire list of issues across all source repositories.
 * 
 * There are scalability limitations to the approach of reading all sources.
 * 
 * @param {Object} sourceRepos
 * @param {string} sourcesGlobalGithubPat
 * @param {string[]} sourceIssuesUrl 
 * @param {string[]} sourceIssues 
 * @param {Object[]} promisedResponses 
 */
async function getSourceIssues(sourceRepos, sourcesGlobalGithubPat, sourceIssuesUrl, sourceIssues, promisedResponses) {
  sourceRepos.forEach(sourceRepo => {
    sourceRepo.urls.forEach(sourceUrl => {
      var effectiveGithubPat = sourceRepo.github_pat ? sourceRepo.github_pat : sourcesGlobalGithubPat;
      getSourceIssuesInternal(sourceUrl, effectiveGithubPat, sourceRepo);
    });
  });

  function getSourceIssuesInternal(sourceUrl, effectiveGithubPat, sourceRepo) {
    var getOptions = {
      url: sourceUrl,
      resolveWithFullResponse: true,
      json: true,
      headers: {
        'User-Agent': GITHUB_USER_AGENT,
        'Accept': GITHUB_ACCEPT_HEADER,
        'Authorization': 'token ' + effectiveGithubPat
      }
    };
    var getSourceIssuesPromise = rp
      .get(getOptions)
      .promise()
      .then(function (response) {
        var body = response.body;
        var keys = Object.keys(body);
        for (var i = 0, length = keys.length; i < length; i++) {
          issue = body[keys[i]];
          if (!sourceIssuesUrl.includes(issue.url)) {
            console.log(JSON.stringify(issue));
            sourceIssuesUrl.push(issue.url);
            var sourceIssue = {
              prefix: sourceRepo.prefix,
              issue: issue
            }
            sourceIssues.push(sourceIssue);
          }
        }
        linkHeader = response.headers.link;
        if (linkHeader) {
          var parsed = parse(linkHeader);
          if (parsed.next) {
            console.log("Next source issues page: " + parsed.next.url);
            return getSourceIssuesInternal(parsed.next.url, effectiveGithubPat, sourceRepo);
          }
        }
      })
      .catch(function (err) {
        console.log("Error in getsource:" + err);
      });
    promisedResponses.push(getSourceIssuesPromise);
  }
}


/**
 * Compares the list of source issues with existing issues and creates the 
 * missing ones in the target repository.
 * 
 * @param {string} targetRepo
 * @param {string} githubPat
 * @param {Object[]} sourceIssues 
 * @param {Object[]} existingIssues 
 */
function createMissingIssues(targetRepo, githubPat, sourceIssues, existingIssues) {
  sourceIssues
    .forEach(sourceIssue => {
      var newTitlePrefix = getSourceIssuePrefix(sourceIssue);
      if (existingIssues.filter(function (v) { return v.title.includes(newTitlePrefix); }).length === 0) {
        var newTitle = getIssueTitle(sourceIssue);
        console.log("Create missing issue:" + newTitle);
        var postIssueOptions = {
          uri: targetRepo + '/issues',
          json: true,
          headers: {
            'User-Agent': GITHUB_USER_AGENT,
            'Accept': 'application/json',
            'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
            'Authorization': 'token ' + githubPat
          },
          body: {
            "title": newTitle,
            "body": createNewIssueBody(sourceIssue.issue),
            "labels": [ GITHUB_REMOTE_LABEL ]
          }
        };
        rp
          .post(postIssueOptions)
          .then(function (body) {
            console.log("Created issue: " + newTitle);
          })
          .catch(function (err) {
            console.log("Error creating ["+newTitle+"]: " + err);
          });
      }
    });
}


/**
 * Compares the list of source issues with existing issues and patches the 
 * existing ones if the corresponding source issue has changed.
 * 
 * @param {string} targetRepo
 * @param {string} githubPat
 * @param {Object[]} existingIssues 
 * @param {Object[]} sourceIssues 
 */
function patchExistingIssues(targetRepo, githubPat, existingIssues, sourceIssues) {
  existingIssues
    .forEach(existingIssue => {
      var existingTitlePrefix = existingIssue.title.substring(0, existingIssue.title.indexOf(']') + 1);
      sourceIssues
        .filter(sourceIssue => existingTitlePrefix === getSourceIssuePrefix(sourceIssue))
        .forEach(sourceIssue => {
          var newTitle = getIssueTitle(sourceIssue);
          var newSourceBody = createNewIssueBody(sourceIssue.issue);
          var newState = sourceIssue.issue.state;
          var isIssueCurrent = 
            (newState === existingIssue.state) &&
            (newTitle === existingIssue.title) && 
            (newSourceBody === existingIssue.body); 
          if (!isIssueCurrent) {
            var patchIssueOptions = {
              uri: targetRepo + '/issues/' + existingIssue.number,
              method: 'PATCH',
              json: true,
              headers: {
                'User-Agent': GITHUB_USER_AGENT,
                'Accept': 'application/json',
                'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
                'Authorization': 'token ' + githubPat
              },
              body: {
                "title": newTitle,
                "body": newSourceBody,
                "state": newState
              }
            };
            rp
              .patch(patchIssueOptions)
              .then(function (body) {
                console.log("Patched issue: " + getIssueTitle(sourceIssue));
              })
              .catch(function (err) {
                console.log("Error patching [" + getIssueTitle(sourceIssue) +"]: " + err);
              });          
          }
        });
    });
}


/**
 * 
 * @param {string} targetRepo 
 * @param {string} githubPat 
 */
function createLabelIfNeeded(targetRepo, githubPat) {
  var getLabelOptions = {
    url: targetRepo + '/labels/' + GITHUB_REMOTE_LABEL,
    json: true,
    resolveWithFullResponse: true,
    simple: false,
    headers: {
      'User-Agent': GITHUB_USER_AGENT,
      'Accept': GITHUB_ACCEPT_HEADER,
      'Authorization': 'token ' + githubPat
    }
  };
  var getLabelPromise = rp
    .get(getLabelOptions)
    .promise()
    .then(function (response) {
      if (response.statusCode === 404) {
        var createLabelOptions = {
          url: targetRepo + '/labels',
          json: true,
          headers: {
            'User-Agent': GITHUB_USER_AGENT,
            'Accept': GITHUB_ACCEPT_HEADER,
            'Authorization': 'token ' + githubPat
          },
          body: {
            "name": GITHUB_REMOTE_LABEL,
            "description": "Aggregated issue from remote repository",
            "color": "ffff33"
          }
        };
        var createLabelPromise = rp
          .post(createLabelOptions)
          .promise()
          .then(function (body) {
            console.log("Created label in target repository: " + GITHUB_REMOTE_LABEL + "-" + JSON.stringify(body));
          });
        return createLabelPromise;
      } else {
        console.log("get label response: " + JSON.stringify(response.body));
      }
    });
  return getLabelPromise;
}

module.exports = sync;
