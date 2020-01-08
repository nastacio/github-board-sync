/*
 *
 */
const app = require('express')();
const request = require('request');
const rp = require('request-promise');
const parse = require('parse-link-header');

const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json';
const GITHUB_CONTENT_TYPE_HEADER = GITHUB_ACCEPT_HEADER;
const GITHUB_ACCEPT_PREVIEW_HEADER = 'application/vnd.github.inertia-preview+json';

var githubPat  = process.env.github_pat;
var targetRepo = process.env.target_repo;

var sourceRepos = [
    { prefix: 'IBMCode',
      urls: ['https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Kabanero',
             'https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Cloud-Pak-Apps'] }
];


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
      'Accept': GITHUB_ACCEPT_HEADER,
      'Authorization': 'token ' + githubPat,
      'Cache-Control': 'no-cache'
    }
  };

  try {
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
            // console.log("Add issue:" + issue.title);
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
      .catch(function (err) {
        console.log("Error: " + err.statusCode + " message:" + err);
      });
    return checkDuplicatesGet;
  } catch (error) {
    return Promise.reject(error);
  }

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
          console.log("Fetched " + sourceIssuesForUrl + " issues from " + sourceUrl);
        })
        .catch(function (err) {
          console.log("Error:" + err);
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
      issue = sourceIssue.issue;
      var newTitlePrefix = "[" + sourceIssue.prefix + " - Test " + issue.number + "]";
      if (existingIssues.filter(function (v) { return v.title.includes(newTitlePrefix); }).length === 0) {
        var newTitle = newTitlePrefix + " " + issue.title;
        console.log("Create missing issue:" + newTitle);
        var postIssueOptions = {
          uri: targetRepo + '/issues',
          json: true,
          headers: {
            'Accept': 'application/json',
            'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
            'Authorization': 'token ' + githubPat
          },
          body: {
            "title": newTitle,
            "body": issue.body,
          }
        };
        // rp
        //   .post(postIssueOptions)
        //   .then(function (body) {
        //     console.log("Created issue: " + newTitle);
        //   })
        //   .catch(function (err) {
        //     console.log("Error creating ["+newTitle+"]: " + err);
        //   });
      }
    });
}


/**
 * 
 * @param {*} sourceIssue 
 */
function getSourceIssuePrefix(sourceIssue) {
  return "[" + sourceIssue.prefix + " - Test " + sourceIssue.issue.number + "]";
}


/**
 * 
 * @param {*} sourceIssue 
 */
function getIssueTitle(sourceIssue) {
  return getSourceIssuePrefix(sourceIssue) + " " + sourceIssue.issue.title;
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
          var newTitlePrefix = getSourceIssuePrefix(sourceIssue);
          var patchIssueOptions = {
            uri: targetRepo + '/issues/' + existingIssue.number,
            method: 'PATCH',
            json: true,
            headers: {
              'Accept': 'application/json',
              'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
              'Authorization': 'token ' + githubPat
            },
            body: {
              "title": getIssueTitle(sourceIssue),
              "body": sourceIssue.issue.body,
              "state": "closed"
            }
          };
          var isIssueCurrent = 
            (sourceIssue.issue.state === existingIssue.state) &&
            (sourceIssue.issue.title === existingIssue.title) && 
            (sourceIssue.issue.body === existingIssue.body); 
          if (!isIssueCurrent) {
            // rp
            //   .patch(patchIssueOptions)
            //   .then(function (body) {
            //     console.log("Patched issue: " + getIssueTitle(sourceIssue));
            //   })
            //   .catch(function (err) {
            //     console.log("Error patching [" + getIssueTitle(sourceIssue) +"]: " + err);
            //   });          
          }
        });
    });
}


/**
 * 
 */
app.get('/', (req, res) => {

  var promisedResponses=[];  

  var existingIssues = [];
  var promise = getExistingIssues(targetRepo + '/issues?state=all', existingIssues);
  promisedResponses.push(promise);

  var projectUrl = '';
  var listProjectsOptions = {
    url: targetRepo + '/projects',
    json: true,
    headers: {
      'Accept': GITHUB_ACCEPT_PREVIEW_HEADER,
      'Authorization': 'token ' + githubPat
    }
  };
  var getProjectUrl = rp
    .get(listProjectsOptions)
    .promise()
    .then(function (body) {
      var keys = Object.keys( body );
      for( var i = 0,length = keys.length; i < length; i++ ) {
        project = body[ keys[i] ];
        if (project.name==='Main') {
          projectUrl = project.url;
        }
      }
    })
  .catch(function (err) {
    console.log("Error "+err)
  });
  promisedResponses.push[getProjectUrl];
  
  var sourceIssues = [];
  var sourceIssuesUrl = [];
  getSourceIssues(sourceIssuesUrl, sourceIssues, promisedResponses);

  Promise
    .allSettled(promisedResponses)
    .then(function(values) {
      console.log("existing:" + existingIssues.length);
      console.log("sourceIssues:" + sourceIssues.length);
      console.log("projectUrl:" + projectUrl);

      // Patch existing items
      patchExistingIssues(existingIssues, sourceIssues);

      // Create missing items
      createMissingIssues(sourceIssues, existingIssues);

      res.set('Content-Type', 'application/json');
      var jsonResponse = {
        targetProjectUrl: projectUrl,
        existingIssuesCount: existingIssues.length,
        sourceIssuesCount: sourceIssues.length,
        existingIssues: existingIssues
                           .sort((i1,i2) => i1.title < i2.title)
                           .map(issue => { return { title: issue.title, url: issue.url } } ),
      }
      res.send(JSON.stringify(jsonResponse));
    });
  


});
 
module.exports.app = app;
