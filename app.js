const app = require('express')()
const request = require('request');
const rp = require('request-promise');

const github_accept_header = 'application/vnd.github+json';
const github_content_type_header = github_accept_header;
const github_accept_preview_header = 'application/vnd.github.inertia-preview+json';

var github_ibm_com_pat   = process.env.github_ibm_com_pat;
var target_repo = 'https://api.github.ibm.com/repos/dnastaci/oncsuite-proto';

var get_options = {
  url: 'https://api.github.ibm.com/repos/IBMCode/IBMCodeContent/issues?labels=Kabanero',
  method: 'GET',
  json: true,
  headers: {
    'Accept': github_accept_header,
    'Authorization': 'token ' + github_ibm_com_pat
  }
};

var check_if_duplicate_options = {
  url: target_repo + '/issues',
  method: 'GET',
  json: true,
  headers: {
    'Accept': github_accept_header,
    'Authorization': 'token ' + github_ibm_com_pat
  }
};

var list_projects_options = {
  url: target_repo + '/projects',
  method: 'GET',
  json: true,
  headers: {
    'Accept': github_accept_preview_header,
    'Authorization': 'token ' + github_ibm_com_pat
  }
};

app.get('/', (req, res) => {

  var existing_titles = [];
  var check_duplicates = rp(check_if_duplicate_options)
    .promise()
    .then(function (body) {
      var keys = Object.keys( body );
      for( var i = 0,length = keys.length; i < length; i++ ) {
        issue = body[ keys[ i ] ];
        existing_titles.push(issue.title);
      }
    })
    .catch(function (err) {
      console.log("Error: "+err.statusCode + " message:" + err)
    });

  var project_url = '';
  var get_project_url = rp(list_projects_options)
    .promise()
    .then(function (body) {
      var keys = Object.keys( body );
      for( var i = 0,length = keys.length; i < length; i++ ) {
        project = body[ keys[ i ] ];
        if (project.name==='Main') {
          project_url = project.url;
        }
      }
    })
  .catch(function (err) {
    console.log("Error "+err)
  });

  var source_issues = [];
  var get_source_issues = rp(get_options)
    .promise()
    .then(function (body) {
      var keys = Object.keys( body );
      for( var i = 0,length = keys.length; i < length; i++ ) {
        issue = body[ keys[ i ] ];
        source_issues.push(issue);
      }
    })
    .catch(function (err) {
      console.log("Error "+err)
    });

  Promise
    .all([check_duplicates, get_project_url,get_source_issues])
    .then(function(values) {
      console.log("existing:" + existing_titles);
      console.log("source_issues:" + source_issues.length);
      console.log("project_url:" + project_url);

      source_issues
        .forEach(issue => { 
          var new_title = "[IBMCode - Test " + issue.number +"] " + issue.title;
          if (! existing_titles.includes(new_title)) {
            console.log("Create missing issue:" + new_title);

            var post_issue_options = {
              uri: 'https://api.github.ibm.com/repos/dnastaci/oncsuite-proto/issues',
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
            rp
              .post(post_issue_options)
              .then(function (body) {
                console.log("Created issue: " + body);
              })
              .catch(function (err) {
                console.log("Error creating ["+new_title+"]: " + err);
              });
        }
      });
  });
  
  res.send("Hello from Appsody3: " + github_ibm_com_pat);
});
 
module.exports.app = app;
