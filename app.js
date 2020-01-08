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

var githubPat   = process.env.github_pat;
var targetRepo = process.env.target_repo;

var sourceRepos = [
    { prefix: 'IBMCode',
      urls: ['https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Kabanero',
             'https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Cloud-Pak-Apps'] }
];


/**
 * Query source repositories for all existing issues
 * 
 * @param {*} target_repo_url 
 * @param {*} existing_issues 
 */
async function getExistingIssues(target_repo_url, existing_issues) {
  const check_if_duplicate_options = {
    url: target_repo_url,
    json: true,
    resolveWithFullResponse: true,
    headers: {
      'Accept': GITHUB_ACCEPT_HEADER,
      'Authorization': 'token ' + githubPat,
      'Cache-Control': 'no-cache'
    }
  };

  try {
    console.log("Processing page: " + target_repo_url);
    const check_duplicates_get = await rp
      .get(check_if_duplicate_options)
      .promise()
      .then(function (response) {
        var body = response.body;
        var keys = Object.keys(body);
        for (var i = 0, length = keys.length; i < length; i++) {
          issue = body[keys[i]];

          if (existing_issues.filter(matches_issue_number()).length === 0) {
            // console.log("Add issue:" + issue.title);
            existing_issues.push(issue);
          }
        }

        console.log("Processed page: " + target_repo_url);
        link_header = response.headers.link;
        if (link_header) {
          var parsed = parse(link_header);
          if (parsed.next) {
              console.log("New page found: " + parsed.next.url);
              return getExistingIssues(parsed.next.url, existing_issues);
          }
        }
      })
      .catch(function (err) {
        console.log("Error: " + err.statusCode + " message:" + err);
      });
    return check_duplicates_get;
  } catch (error) {
    return Promise.reject(error);
  }

  function matches_issue_number() {
    return function (existing_issue) { return existing_issue.number === issue.number; };
  }
}


/**
 * 
 * @param {*} source_issues_url 
 * @param {*} source_issues 
 * @param {*} promised_responses 
 */
function getSourceIssues(source_issues_url, source_issues, promised_responses) {
  sourceRepos.forEach(source_repo => {
    source_repo.urls.forEach(source_url => {
      var source_issues_for_url = 0;
      var get_options = {
        url: source_url,
        json: true,
        headers: {
          'Accept': GITHUB_ACCEPT_HEADER,
          'Authorization': 'token ' + githubPat
        }
      };
      var get_source_issues = rp
        .get(get_options)
        .promise()
        .then(function (body) {
          var keys = Object.keys(body);
          for (var i = 0, length = keys.length; i < length; i++) {
            issue = body[keys[i]];
            if (!source_issues_url.includes(issue.url)) {
              source_issues_url.push(issue.url);
              source_issues.push({
                prefix: source_repo.prefix,
                issue: issue
              });
              source_issues_for_url++;
            }
          }
          console.log("Fetched " + source_issues_for_url + " issues from " + source_url);
        })
        .catch(function (err) {
          console.log("Error:" + err);
        });
      promised_responses.push(get_source_issues);
    });
  });
}


/**
 * 
 * @param {*} source_issues 
 * @param {*} existing_issues 
 */
function createMissingIssues(source_issues, existing_issues) {
  source_issues
    .forEach(source_issue => {
      issue = source_issue.issue;
      var new_title_prefix = "[" + source_issue.prefix + " - Test " + issue.number + "]";
      if (existing_issues.filter(function (v) { return v.title.includes(new_title_prefix); }).length === 0) {
        var new_title = new_title_prefix + " " + issue.title;
        console.log("Create missing issue:" + new_title);
        var post_issue_options = {
          uri: targetRepo + '/issues',
          json: true,
          headers: {
            'Accept': 'application/json',
            'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
            'Authorization': 'token ' + githubPat
          },
          body: {
            "title": new_title,
            "body": issue.body,
          }
        };
        // rp
        //   .post(post_issue_options)
        //   .then(function (body) {
        //     console.log("Created issue: " + new_title);
        //   })
        //   .catch(function (err) {
        //     console.log("Error creating ["+new_title+"]: " + err);
        //   });
      }
    });
}


/**
 * 
 * @param {*} source_issue 
 */
function getSourceIssuePrefix(source_issue) {
  return "[" + source_issue.prefix + " - Test " + source_issue.issue.number + "]";
}


/**
 * 
 * @param {*} source_issue 
 */
function getIssueTitle(source_issue) {
  return getSourceIssuePrefix(source_issue) + " " + source_issue.issue.title;
}



/**
 * 
 * @param {*} existing_issues 
 * @param {*} source_issues 
 */
function patchExistingIssues(existing_issues, source_issues) {
  existing_issues
    .forEach(existing_issue => {
      var existing_title_prefix = existing_issue.title.substring(0, existing_issue.title.indexOf(']') + 1);
      source_issues
        .filter(source_issue => existing_title_prefix === getSourceIssuePrefix(source_issue))
        .forEach(source_issue => {
          var new_title_prefix = getSourceIssuePrefix(source_issue);
          var patch_issue_options = {
            uri: targetRepo + '/issues/' + existing_issue.number,
            method: 'PATCH',
            json: true,
            headers: {
              'Accept': 'application/json',
              'Content-Type': GITHUB_CONTENT_TYPE_HEADER,
              'Authorization': 'token ' + githubPat
            },
            body: {
              "title": getIssueTitle(source_issue),
              "body": source_issue.issue.body,
              "state": "closed"
            }
          };
          var isIssueCurrent = 
            (source_issue.issue.state === existing_issue.state) &&
            (source_issue.issue.title === existing_issue.title) && 
            (source_issue.issue.body === existing_issue.body); 
          if (!isIssueCurrent) {
            // rp
            //   .patch(patch_issue_options)
            //   .then(function (body) {
            //     console.log("Patched issue: " + getIssueTitle(source_issue));
            //   })
            //   .catch(function (err) {
            //     console.log("Error patching [" + getIssueTitle(source_issue) +"]: " + err);
            //   });          
          }
        });
    });
}


/**
 * 
 */
app.get('/', (req, res) => {

  var promised_responses=[];  

  var existing_issues = [];
  var promise = getExistingIssues(targetRepo + '/issues?state=all', existing_issues);
  promised_responses.push(promise);

  var project_url = '';
  var list_projects_options = {
    url: targetRepo + '/projects',
    json: true,
    headers: {
      'Accept': GITHUB_ACCEPT_PREVIEW_HEADER,
      'Authorization': 'token ' + githubPat
    }
  };
  var get_project_url = rp
    .get(list_projects_options)
    .promise()
    .then(function (body) {
      var keys = Object.keys( body );
      for( var i = 0,length = keys.length; i < length; i++ ) {
        project = body[ keys[i] ];
        if (project.name==='Main') {
          project_url = project.url;
        }
      }
    })
  .catch(function (err) {
    console.log("Error "+err)
  });
  promised_responses.push[get_project_url];
  
  var source_issues = [];
  var source_issues_url = [];
  getSourceIssues(source_issues_url, source_issues, promised_responses);

  Promise
    .allSettled(promised_responses)
    .then(function(values) {
      console.log("existing:" + existing_issues.length);
      console.log("source_issues:" + source_issues.length);
      console.log("project_url:" + project_url);

      // Patch existing items
      patchExistingIssues(existing_issues, source_issues);

      // Create missing items
      createMissingIssues(source_issues, existing_issues);

      res.set('Content-Type', 'application/json');
      var jsonResponse = {
        target_project_url: project_url,
        existing_issues_count: existing_issues.length,
        source_issues_count: source_issues.length,
        existing_issues: existing_issues
                           .sort((i1,i2) => i1.title < i2.title)
                           .map(issue => { return { title: issue.title, url: issue.url } } ),
      }
      res.send(JSON.stringify(jsonResponse));
    });
  


});
 
module.exports.app = app;
