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
| `sources_global_github_pat` | Optional GitHub Personal Access Token for all source repositories. If not specified, then `github_pat` is used. It is overridden by tokens defined inside the `source_repos` array. |
| `source_repos`| A JSON array of all repositories that should be queried for issues. As a current limitation, the JSON array must be represented in a single-line inside the file. See the sub-section on this page for the structure of the element. |


## Structure of the `source_repos` element

```json
[
      { 
        "prefix": "Some short string that will be used in the title of the target issue",
        "github_pat": "<GitHub Personal Access Token for the URLs in the 'urls' element.>",
        "urls": ["<github_v3_api for the source issues>", ...],
        "labels_on_target": [
          "<label1>",
          ...
          "<labelN>",
        ]
      }
  ]
```


## Example:

```json
{ 
  "github_pat": "...",
  "target_repo": "https://api.github.com/repos/nastacio/github-board-sync-test",
  "source_repos": [ 
    { "prefix": "DN",
      "urls": ["https://api.github.com/repos/nastacio/github-board-sync/issues?assignee=nastacio&state=all"],
      "github_pat": "...",
      "labels_on_target": [
         "kind/label1",
         "kind/label2"
      ]
    }
  ]
}
```

# Running the app

1. Create a configuration file following the example above, replacing the values with the values matching your GitHub accounts.
    ```sh
    config_contents=$(cat "${your_config_file}" | tr -d "\n" | tr -d " ")
1. Build the container image:
    ```sh
    docker build . -t github-sync-app
    ```
1. Trigger a reconciliation run:
    ```sh
    docker run --rm -it -e config=${config_contents} github-sync-app
    ```

## Example of completion

This project shows the results of running the reconciliation:
https://github.com/nastacio/github-board-sync-test/issues


# Setting up invocations with IBM Code Engine

See `iaas/code-engine/ibmcloud-install.sh`

Example: 

```sh
./iaas/code-engine/ibmcloud-install.sh 
    --setup \
    --project sdlc-prod \
    --config path/github-sync-test.json \
    --schedule "0 * * * *"
```
