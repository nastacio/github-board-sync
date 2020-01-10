# github-board-sync
Mirrors select items from remote repositories into a single repository

# Overview

The application initially gets a summary of all existing issues in a target repository and, reads the source repositories for the list of new issues, creates the missing items in the target repository, and patches the existing items in case they have changed in the respective source repository.

Upon execution, all source issues indicated in the configuration will 

# Configuration file

The configuration file is a properties file with keys and values, matching the table below:

| | |
|---|---|
| `target_repo` | [GitHub v3 API](https://developer.github.com/v3/) for the target repository where the reconciliation will take place, e.g. https://api.github.ibm.com/repos/dnastaci/oncsuite-proto. |
| `github_pat` | [GitHub Personal Access Token](https://github.com/settings/tokens) for the target repository. |
| `sources_global_github_pat` | Optional GitHub Personal Access Token for all source repositories. If not specified, then `github_pat` is used. It is overriden by tokens defined inside the `source_repos` array. |
| `source_repos`| A JSON array of all repositories that should be queried for issues. As a current limitation, the JSON array must be represented in a single-line inside the file. See the sub-section in this page for the structure of the element. |


## Structure of the `source_repos` element

```json
[
      { 
        "prefix": "Some short string that will be used in the title of the target issue",
        "github_pat": "<GitHub Personal Access Token for the URLS in the "urls" element.>",
        "urls": [ "<github_v3_api for the source issues>", "<github_v3_api for the source issues>" ] 
      }
  ]
```


## Example:

```
target_repo=https://api.github.com/repos/nastacio/github-board-sync-test

github_pat=...

source_repos=[ { "prefix": "appsody stack", "urls": ["https://api.github.com/repos/appsody/stacks/issues?labels=enhancement"] }, { "prefix": "my codewind", "urls": ["https://api.github.com/repos/eclipse/codewind/issues?labels=tech-topic"] }]
```

# Running the app with Appsody

1. Install [Appsody](https://appsody.dev)
1. Create a configuration file following the example above, replacing the values with the values matching your GitHub accounts.
    ```
    config_file=<configuration file following the example in this readme>

    appsody run --docker-options="--env-file=${config_file}"
    ```
1. Trigger a reconciliation run, by accessing the application at https://localhost:3000/

## Example of completion

This project shows the results of running the reconciliation:
https://github.com/nastacio/github-board-sync-test/issues


# Running the app with OpenWhisk

```
rm action.zip
zip action.zip github-sync.js
cd openwhisk
rm -rf node_modules
npm install
zip -rq ../action.zip *
cd -

config_file=~/etc/github-sync-test.env
ibmcloud fn action update github-sync-test action.zip --kind nodejs:default --param-file ${config_file}
ibmcloud fn action invoke github-sync-test --param-file ${config_file} -r
```