# github-board-sync
Mirrors select items from remote repositories into a single repository

# Configuration file

```
github_ibm_com_pat=...
target_repo=https://api.github.ibm.com/repos/dnastaci/oncsuite-proto
```

# Running the app

The application initially gets a summary of all existing issues in a target repository and, reads the source repositories for the list of new issues, then creates the missing items in the target repository.

```
appsody run --docker-options="--env-file=/Users/nastacio/etc/github-sync.env"
```

To-Dos:
1. The source repositories need to be moved to the configuration file
2. The issues should have a reference to the source issue beyond the issue number in the title
3. Changes to source issue should get reflected in existing issue, such as state and body