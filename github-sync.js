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

    var createLabelPromise = createLabelIfNeeded(targetRepo, githubPat, GITHUB_REMOTE_LABEL, "Aggregated issue from remote repository", "ffff33");
    promisedResponses.push(createLabelPromise);

    var createLabelsPromise = createLabelsIfNeeded(targetRepo, githubPat, sourceRepos);
    promisedResponses.push(createLabelsPromise);

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

    var finalPromise = Promise
      .all(promisedResponses)
      .then(function(values) {
        console.log("existing:" + existingIssues.length);
        console.log("sourceIssues:" + sourceIssues.length);
        console.log("projectUrl:" + projectUrl);

        var patchPromises = patchExistingIssues(targetRepo, githubPat, existingIssues, sourceIssues);
        var createPromises = createMissingIssues(targetRepo, githubPat, sourceIssues, existingIssues);
        var reconcilePromises = patchPromises.concat(createPromises);
        var reconcilePromise = Promise
          .all(reconcilePromises)
          .then(function(values) {
            var jsonResponse = {
              targetProjectUrl: projectUrl,
              existingIssuesCount: existingIssues.length,
              sourceIssuesCount: sourceIssues.length,
              existingIssues: existingIssues
                                .sort((i1,i2) => i1.title < i2.title)
                                .map(issue => { return { title: issue.title, url: issue.url, state: issue.state } } ),
            }
            console.log("Synchronization of [" + reconcilePromises.length + "] items was complete without errors");
            return jsonResponse;
          });
        return reconcilePromise;
      })
      .catch(function (err) {
        console.log("Error in promises: " + err);
        return "Error in promises: " + err;
      });

      return finalPromise;
  }


/**
 * New body for an issue in the target repo
 * 
 * @param {Object} sourceIssue a GitHub issue, according to https://developer.github.com/v3/issues/
 */
function createNewIssueBody(sourceIssue) {
  return "Aggregated from: " + sourceIssue.html_url + "\n\nDescription in source issue:\n\n" + sourceIssue.body;
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
 * First part of the title for an issue in the target repo.
 * 
 * @param {Object} sourceIssue a GitHub issue, according to https://developer.github.com/v3/issues/
 */
function getSourceIssueLabelsOnTarget(sourceIssue) {
  return sourceIssue.labels_on_target;
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
          if (!issue.html_url.includes('/pull/') && !sourceIssuesUrl.includes(issue.url)) {
            sourceIssuesUrl.push(issue.url);
            var sourceIssue = {
              prefix: sourceRepo.prefix,
              labels_on_target: sourceRepo.labels_on_target,
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
 * Returns an array with the promises of all requests.
 * 
 * @param {string} targetRepo
 * @param {string} githubPat
 * @param {Object[]} sourceIssues 
 * @param {Object[]} existingIssues 
 */
function createMissingIssues(targetRepo, githubPat, sourceIssues, existingIssues) {
  var resultPromises = [];

  sourceIssues
    .forEach(sourceIssue => {
      var newTitlePrefix = getSourceIssuePrefix(sourceIssue);
      if (existingIssues.filter(function (v) { return v.title.includes(newTitlePrefix); }).length === 0) {
        var newTitle = getIssueTitle(sourceIssue);
        var labelsOnTarget = getSourceIssueLabelsOnTarget(sourceIssue);
        var allLabelsOnTarget = [ GITHUB_REMOTE_LABEL ];
        allLabelsOnTarget = allLabelsOnTarget.concat(labelsOnTarget)
        console.log("Create missing issue:" + newTitle + " with labels: " + allLabelsOnTarget);
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
            "labels": allLabelsOnTarget,
            "state": sourceIssue.issue.state
          }
        };
        var createPromise = rp
          .post(postIssueOptions)
          .promise()
          .then(function (body) {
            console.log("Created issue: " + newTitle + " : " + body.number);
            var assignPromises = assignOwnersIfPossible(targetRepo, githubPat, body.number, sourceIssue.issue.assignees)
            var assignAllPromises = Promise
              .all(assignPromises)
              .then(() => {
                console.log("Assigned all owners for new issue " + body.number)
              })
            return assignAllPromises;
          })
          .catch(function (err) {
            console.log("Error creating ["+newTitle+"]: " + err);
          });
        resultPromises.push(createPromise);
      }
    });

  return resultPromises;
}


/**
 * Compares the list of source issues with existing issues and patches the 
 * existing ones if the corresponding source issue has changed.
 * 
 * Returns an array with the promises of all requests.
 * 
 * @param {string} targetRepo
 * @param {string} githubPat
 * @param {Object[]} existingIssues 
 * @param {Object[]} sourceIssues 
 */
function patchExistingIssues(targetRepo, githubPat, existingIssues, sourceIssues) {
  var resultPromises = [];

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
            var patchPromise = rp
              .patch(patchIssueOptions)
              .promise()
              .then(function (body) {
                console.log("Patched issue: " + getIssueTitle(sourceIssue));
                var assignPromises = assignOwnersIfPossible(targetRepo, githubPat, existingIssue.number, sourceIssue.issue.assignees)
                var assignAllPromises = Promise
                  .all(assignPromises)
                  .then(() => {
                    console.log("Assigned all owners for changed issue " + existingIssue.number)
                  })
                return assignAllPromises;
              })
              .catch(function (err) {
                console.log("Error patching [" + getIssueTitle(sourceIssue) +"]: " + err);
              });   
            resultPromises.push(patchPromise);
          } else {
            var assignPromises = assignOwnersIfPossible(targetRepo, githubPat, existingIssue.number, sourceIssue.issue.assignees)
            var assignAllPromises = Promise
              .all(assignPromises)
              .then(() => {
                console.log("Assigned all owners for unchanged issue " + existingIssue.number)
                })
            resultPromises.push(assignAllPromises)
          }
        });
    });
  return resultPromises;
}


/**
 * 
 * @param {*} targetRepo 
 * @param {*} githubPat 
 * @param {*} issueNumber 
 * @param {*} assignees 
 */
function assignOwnersIfPossible(targetRepo, githubPat, issueNumber, assignees) {
  var resultPromises = [];

  assignees
    .forEach(assignee => {
      var targetUri = targetRepo + '/assignees/' + assignee.login
      var assigneeOptions = {
        uri: targetUri,
        method: 'GET',
        json: true,
        headers: {
          'User-Agent': GITHUB_USER_AGENT,
          'Accept': 'application/json',
          'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
          'Authorization': 'token ' + githubPat
        }
      };
      var assigneePromise = rp
        .get(assigneeOptions)
        .promise()
        .then(function (body) {
          return assignOwner(targetRepo, githubPat, issueNumber, assignee.login) 
        })
        .catch(function (err) {
          console.log("Error getting assignee status for " + assignee + " at " + targetUri);
        });   
      resultPromises.push(assigneePromise);
    });

  return resultPromises;
}


/**
 * 
 * @param {*} targetRepo 
 * @param {*} githubPat 
 * @param {*} issueNumber 
 * @param {*} assignee
 */
function assignOwner(targetRepo, githubPat, issueNumber, assignee) {
  var targetUri = targetRepo + '/issues/' + issueNumber + '/assignees'
  var assigneeOptions = {
    uri: targetUri,
    method: 'POST',
    json: true,
    headers: {
      'User-Agent': GITHUB_USER_AGENT,
      'Accept': 'application/json',
      'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
      'Authorization': 'token ' + githubPat
    },
    body: {
      "assignees": [assignee]
    }
  };
  var assigneePromise = rp
    .post(assigneeOptions)
    .promise()
    .then(function (body) {
      console.log("Assigned " + assignee + " to issue " + issueNumber);
    })
    .catch(function (err) {
      console.log("Error assigning " + assignee + " to issue " + issueNumber);
    });   

  return assigneePromise;
}


/**
 * 
 * @param {string} targetRepo 
 * @param {string} githubPat 
 * @param {string} sourceRepos configuration information for all source repositories
 */
async function createLabelsIfNeeded(targetRepo, githubPat, sourceRepos) {
  sourceRepos.forEach(sourceRepo => {
    sourceRepo.urls.forEach(sourceUrl => {
      var labels = sourceRepo.labels_on_target
      if (labels != null) {
        labels.forEach(label => {
          createLabelIfNeeded(targetRepo, githubPat, label, "<This label needs a description>", label.toRGB())
        });
      }
    });
  });
}


/**
 * 
 * @param {string} targetRepo 
 * @param {string} githubPat 
 * @param {string} label new label to be created
 * @param {string} color RGB color index
 */
function createLabelIfNeeded(targetRepo, githubPat, label, labelDescription, color) {
  var getLabelOptions = {
    url: targetRepo + '/labels/' + label,
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
            "name": label,
            "description": labelDescription,
            "color": color
          }
        };
      var createLabelPromise = rp
          .post(createLabelOptions)
          .promise()
          .then(function (body) {
            console.log("Created label in target repository: " + label + "-" + JSON.stringify(body));
          });
        return createLabelPromise;
      } else {
        console.log("get label response: " + JSON.stringify(response.body));
      }
    });
  return getLabelPromise;
}

/**
 * 
 */
String.prototype.toRGB = function() {
  var hash = 0;
  if (this.length === 0) return hash;
  for (var i = 0; i < this.length; i++) {
      hash = this.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
  }
  var randomColor = Math.floor(hash).toString(16);
  randomColor = randomColor.substr(randomColor.length - 6);
  return randomColor;
}

module.exports = sync;
