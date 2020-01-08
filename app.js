/*
 *
 */
const app = require('express')();
const request = require('request');
const rp = require('request-promise');
const parse = require('parse-link-header');

const github_accept_header = 'application/vnd.github+json';
const github_content_type_header = github_accept_header;
const github_accept_preview_header = 'application/vnd.github.inertia-preview+json';

var github_ibm_com_pat   = process.env.github_ibm_com_pat;
var target_repo = process.env.target_repo;

var source_repos = [
    { prefix: 'IBMCode',
      urls: ['https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Kabanero',
             'https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Cloud-Pak-Apps'] }
];


/**
 * Query source repositories for all existing issues
 */
function get_existing_titles(target_repo_url, existing_titles) {
  var check_if_duplicate_options = {
    url: target_repo_url,
    json: true,
    resolveWithFullResponse: true,
    headers: {
      'Accept': github_accept_header,
      'Authorization': 'token ' + github_ibm_com_pat,
      'Cache-Control': 'no-cache'
    }
  };

  var check_duplicates_get = rp
    .get(check_if_duplicate_options)
    .then(function (response) {
      link_header = response.headers.link;
      if (link_header) {
        var parsed = parse(link_header);
        if (parsed.next) {
          get_existing_titles(parsed.next.url, existing_titles);
        }
      }
      var body = response.body;
      var keys = Object.keys(body);
      for (var i = 0, length = keys.length; i < length; i++) {
        issue = body[keys[i]];
        if (!existing_titles.includes(issue.title)) {
          existing_titles.push(issue.title);
        }
      }
      console.log("Processed page: " + target_repo_url);
    })
    .catch(function (err) {
      console.log("Error: " + err.statusCode + " message:" + err);
    });
}


/**
 * 
 */
app.get('/', (req, res) => {

  var existing_titles = [];
  get_existing_titles(target_repo + '/issues', existing_titles);

  var promised_responses=[];  
  var project_url = '';
  var list_projects_options = {
    url: target_repo + '/projects',
    json: true,
    headers: {
      'Accept': github_accept_preview_header,
      'Authorization': 'token ' + github_ibm_com_pat
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
  source_repos.forEach(source_repo => {
    source_repo.urls.forEach(source_url => {
      var source_issues_for_url = 0;
      var get_options = {
        url: source_url,
        json: true,
        headers: {
          'Accept': github_accept_header,
          'Authorization': 'token ' + github_ibm_com_pat
        }
      };
      var get_source_issues = rp
        .get(get_options)
        .promise()
        .then(function (body) {
          var keys = Object.keys( body );
          for( var i = 0,length = keys.length; i < length; i++ ) {
            issue = body[ keys[i] ];
            if (!source_issues_url.includes(issue.url)) {
              source_issues_url.push(issue.url);
              source_issues.push( { prefix: source_repo.prefix, 
                                    issue: issue });
              source_issues_for_url++;
            }
          }
          console.log("Fetched " + source_issues_for_url + " issues from " + source_url);
        })
        .catch(function (err) {
          console.log("Error:" + err)
        });
      promised_responses.push(get_source_issues);
    });
  });

  console.log("Promises: " + promised_responses.length);

  Promise
    .allSettled(promised_responses)
    .then(function(values) {
      console.log("existing:" + existing_titles.length);
      existing_titles.sort().forEach(title => console.log("existing:" + title));
      console.log("source_issues:" + source_issues.length);
      console.log("project_url:" + project_url);

      source_issues
        .forEach(source_issue => { 
          issue = source_issue.issue;
          var new_title = "[" + source_issue.prefix + " - Test " + issue.number +"] " + issue.title;
          if (! existing_titles.includes(new_title)) {
            console.log("Create missing issue:" + new_title);

            var post_issue_options = {
              uri: target_repo + '/issues',
              method: 'POST',
              json: true,
              headers: {
                'Accept': 'application/json',
                'Content-Type': github_content_type_header,
                'Authorization': 'token ' + github_ibm_com_pat
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
  });
  
  res.send("Hello from Appsody3: " + github_ibm_com_pat);
});
 
module.exports.app = app;
  