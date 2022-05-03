#!/bin/bash

# https://cloud.ibm.com/docs/codeengine

set -eo pipefail
set +x

scriptname=$(basename "${0}")

verbose=0

#
# Execution parameters
#
: "${IBM_CLOUD_API:=https://cloud.ibm.com}"
: "${IBM_CLOUD_REGION:=us-south}"
: "${IBM_CLOUD_RESOURCE_GROUP:=ci-cd}"
: "${IBM_CLOUD_API_KEY:=really needs to be set by caller}"

: "${project:=${PROJECT:-sdlc-prod}}"

config_file=needs-to-be-set-by-caller

#
# Usage statement
#
function usage() {
    echo "Setup the toolchain for a component."
    echo ""
    echo "Usage: ${scriptname} [OPTIONS]...[ARGS]"
    echo
    echo "        --apikey <apikey>"
    echo "                     IBM Cloud API Key with admin privileges on the account."
    echo "        --config <file location>"
    echo "                     Config file for the job."
    echo "  -s  | --setup"
    echo "                     Setup the job in the account"
    echo "        --schedule <cron_schedule>"
    echo "                     Schedule cronjob, e.g. \"0 * * * *\""
    echo "  -p  | --project <project name>"
    echo "                     Target project. Default is ${project}"
    echo "  -r  | --resource-group <resource group>"
    echo "                     Resource group for the function."
    echo ""
    echo "  -v  | --verbose    Prints extra information about each command."
    echo "  -h  | --help       Output this usage statement."
}


#
# Verbose statement
#
function echo_verbose() {
    if [ ${verbose} -eq 1 ]; then
        echo "$1"
    fi
}


#
# Prints a formatted message with the timestamp of execution
#
function log() {
    local msg=${1}
    echo "$(date +%Y-%m-%dT%H:%M:%S%z): ${msg}"
}


#
#
#
function setup() {
    local job_name=github-sync
    local secret_name=${job_name}-default
    local subscription_name=${job_name}-schedule

    local result=0

    log "INFO: Selecting target project."
    ibmcloud ce project get --name "${project}" > /dev/null 2>&1 || \
    ibmcloud ce project create --name "${project}" --wait

    ibmcloud ce project select --name "${project}"

    log "INFO: Defining default job parameters."
    local secret_cmd=create
    ibmcloud ce secret get --name "${secret_name}" -q > /dev/null 2>&1 \
    && ibmcloud ce secret delete --name "${secret_name}" -f

    ibmcloud ce secret "${secret_cmd}" \
        --name "${secret_name}" \
        --from-file config=${config_file}

    local job_cmd=create
    ibmcloud ce job get --name "${job_name}" 2> /dev/null && job_cmd=update
    log "INFO: Creating job..." \
    && ibmcloud ce job "${job_cmd}" \
        --name "${job_name}" \
        --build-source . \
        --build-strategy dockerfile -o json \
        --env-from-secret "${secret_name}" \
        --cpu 0.125 \
        --memory 0.5G \
        --instances 1 \
        --maxexecutiontime 360 \
        --retrylimit 1 \
        --wait \
    && log "INFO: Job ${job_name} created." \
    || result=1

    if [ "${create_subscription}" -eq 1 ] && [ ${result} -eq 0 ]; then
        local sub_cmd=create
        local wait_param=(--wait)
        ibmcloud ce subscription cron get \
                --name "${subscription_name}" 2>/dev/null \
            && {
                sub_cmd=update
                wait_param=()
            }
        ibmcloud ce subscription cron "${sub_cmd}" \
                --destination "${job_name}" \
                --destination-type job \
                --name "${subscription_name}" \
                --schedule "${subscription_schedule}" \
                "${wait_param[@]}" \
        && ibmcloud ce subscription cron get \
                --name github-sync-schedule \
        || result=1
    fi

    if [ ${result} -eq 1 ]; then
        log "ERROR: Unable to create the job."
    fi

    return ${result}
}


apikey=${IBM_CLOUD_API_KEY:-""}
create=0
create_subscription=0
subscription_schedule="0 * * * *"
while [[ $# -gt 0 ]]
do
key="$1"
shift
case $key in
    --apikey)
    apikey=$1
    shift
    ;;
    --config)
    config_file=$1
    shift
    ;;
    -r|--resource-group)
    IBM_CLOUD_RESOURCE_GROUP=$1
    shift
    ;;
    -p|--project)
    project=$1
    shift
    ;;
    -h|--help)
    usage
    exit
    ;;
    -s|--setup)
    create=1
    ;;
    --schedule)
    create_subscription=1
    subscription_schedule=$1
    shift
    ;;
    -v|--verbose)
    verbose=1
    set -x
    ;;
    *)
    echo "Unrecognized parameter: $key"
    usage
    exit 1
esac
done

if [ ${create} -eq 0 ]; then
    echo "ERROR: an operation must be selected."
    exit 2
fi

if [ "${apikey}" == "" ]; then
    echo "ERROR: an API key must be specified (https://cloud.ibm.com/iam/apikeys)."
    exit 3
fi

WORKDIR=$(mktemp -d) || exit 1
function cleanWorkDir() {
    if [ -n "${WORKDIR}" ]; then
        rm -rf "${WORKDIR}"
    fi
}
trap cleanWorkDir EXIT

log "INFO: Ensuring plugin is up-to-date."
if ibmcloud plugin show code-engine > /dev/null 2>&1; then
    ibmcloud plugin update code-engine -f > /dev/null
else
    ibmcloud plugin install code-engine -f 
fi

log "INFO: Login to IBM Cloud."
ibmcloud login --apikey "${apikey}" -r "${IBM_CLOUD_REGION}" -g "${IBM_CLOUD_RESOURCE_GROUP}" -a "${IBM_CLOUD_API}"

if [ ${create} -eq 1 ]; then
    setup
fi
