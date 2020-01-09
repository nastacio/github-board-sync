/*
 *
 */
const app = require('express')();
const request = require('request');
const rp = require('request-promise');
const parse = require('parse-link-header');

const GITHUB_USER_AGENT = 'github-board-sync';
const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json';
const GITHUB_CONTENT_TYPE_HEADER = GITHUB_ACCEPT_HEADER;
const GITHUB_ACCEPT_PREVIEW_HEADER = 'application/vnd.github.inertia-preview+json';

// Added to issues created and managed by this tool
const GITHUB_REMOTE_LABEL = "remote";

var githubPat  = process.env.github_pat;
var targetRepo = process.env.target_repo;
var sourceRepos = JSON.parse(process.env.source_repos);

/**
 * 
 */
function createNewIssueBody(sourceIssue) {
  return "Aggregated from: " + sourceIssue.url + "\n\nDescription in source issue:\n\n" + sourceIssue.body;
}

/**
 * 
 * @param {*} sourceIssue 
 */
function getSourceIssuePrefix(sourceIssue) {
  return "[" + sourceIssue.prefix + " - " + sourceIssue.issue.number + "]";
}


/**
 * 
 * @param {*} sourceIssue 
 */
function getIssueTitle(sourceIssue) {
  return getSourceIssuePrefix(sourceIssue) + " " + sourceIssue.issue.title;
}


/**
 * Query source repositories for all existing issues
 * 
 * @param {*} targetRepoUrl 
 * @param {*} existingIssues 
 */
async function getExistingIssues(targetRepoUrl, existingIssues) {
  const checkIfDuplicateOptions = {
    url: targetRepoUrl,
    json: true,
    resolveWithFullResponse: true,
    headers: {
      'User-Agent': GITHUB_USER_AGENT,
      'Accept': GITHUB_ACCEPT_HEADER,
      'Authorization': 'token ' + githubPat,
      'Cache-Control': 'no-cache'
    }
  };

  console.log("Processing page: " + targetRepoUrl);
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

      console.log("Processed page: " + targetRepoUrl);
      linkHeader = response.headers.link;
      if (linkHeader) {
        var parsed = parse(linkHeader);
        if (parsed.next) {
            console.log("New page found: " + parsed.next.url);
            return getExistingIssues(parsed.next.url, existingIssues);
        }
      }
    })
  return checkDuplicatesGet;

  function matchesIssueNumber() {
    return function (existingIssue) { return existingIssue.number === issue.number; };
  }
}


/**
 * 
 * @param {*} sourceIssuesUrl 
 * @param {*} sourceIssues 
 * @param {*} promisedResponses 
 */
function getSourceIssues(sourceIssuesUrl, sourceIssues, promisedResponses) {
  sourceRepos.forEach(sourceRepo => {
    sourceRepo.urls.forEach(sourceUrl => {
      var sourceIssuesForUrl = 0;
      var getOptions = {
        url: sourceUrl,
        json: true,
        headers: {
          'User-Agent': GITHUB_USER_AGENT,
          'Accept': GITHUB_ACCEPT_HEADER,
          'Authorization': 'token ' + githubPat
        }
      };
      var getSourceIssues = rp
        .get(getOptions)
        .promise()
        .then(function (body) {
          var keys = Object.keys(body);
          for (var i = 0, length = keys.length; i < length; i++) {
            issue = body[keys[i]];
            if (!sourceIssuesUrl.includes(issue.url)) {
              sourceIssuesUrl.push(issue.url);
              sourceIssues.push({
                prefix: sourceRepo.prefix,
                issue: issue
              });
              sourceIssuesForUrl++;
            }
          }
          console.log("Fetched " + sourceIssuesForUrl + " issues from " + getOptions.url);
        })
        .catch(function (err) {
          console.log("Error in getsource:" + err);
        });
      promisedResponses.push(getSourceIssues);
    });
  });
}


/**
 * 
 * @param {*} sourceIssues 
 * @param {*} existingIssues 
 */
function createMissingIssues(sourceIssues, existingIssues) {
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
 * 
 * @param {*} existingIssues 
 * @param {*} sourceIssues 
 */
function patchExistingIssues(existingIssues, sourceIssues) {
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
 */
function createLabelIfNeeded() {
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


/**
 * 
 */
app.get('/', (req, res) => {

  var promisedResponses=[];  

  var existingIssues = [];
  const initialTargetRepo = targetRepo + '/issues?state=all&labels=' + GITHUB_REMOTE_LABEL;
  var existingIssuePromise = getExistingIssues(initialTargetRepo, existingIssues);
  promisedResponses.push(existingIssuePromise);

  var getLabelPromise = createLabelIfNeeded();
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
  getSourceIssues(sourceIssuesUrl, sourceIssues, promisedResponses);

  Promise
    .all(promisedResponses)
    .then(function(values) {
      console.log("existing:" + existingIssues.length);
      console.log("sourceIssues:" + sourceIssues.length);
      console.log("projectUrl:" + projectUrl);

      patchExistingIssues(existingIssues, sourceIssues);

      createMissingIssues(sourceIssues, existingIssues);

      res.set('Content-Type', 'application/json');
      var jsonResponse = {
        targetProjectUrl: projectUrl,
        existingIssuesCount: existingIssues.length,
        sourceIssuesCount: sourceIssues.length,
        existingIssues: existingIssues
                           .sort((i1,i2) => i1.title < i2.title)
                           .map(issue => { return { title: issue.title, url: issue.url, state: issue.state } } ),
      }
      res.send(JSON.stringify(jsonResponse));
    })
    .catch(function (err) {
      console.log("Error in promises: " + err);
    });


});
 
module.exports.app = app;
