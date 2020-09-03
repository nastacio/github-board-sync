#!/bin/sh

original_dir=$PWD

set -e
set -x

#
# Execution parameters
#
cloud_url=https://cloud.ibm.com
region=us-south

resource_group=${RESOURCE_GROUP:-abp-ci-cd}
namespace=${NAMESPACE:-cloudfn}

action_name=github-sync
config_file=~/etc/github.env

#
# Usage statement
#
function usage() {
    echo "Setup the toolchain for a component."
    echo ""
    echo "Usage: $scriptname [OPTIONS]...[ARGS]"
    echo
    echo "        --apikey     IBM Cloud API Key with admin privileges on the account."
    echo "        --config"
    echo "                     Config file for the function."
    echo "  -s  | --setup"
    echo "                     Setup the function in the account"
    echo "  -n  | --namespace"
    echo "                     Function namespace. Default is ${namespace}"
    echo "  -r  | --resource_group"
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
#
#
function setup() {
    trigger_name=${action_name}-trigger
    rule_name=${action_name}-rule

    ibmcloud fn namespace get ${namespace} > /dev/null 2>&1 || \
    ibmcloud fn namespace create ${namespace}

    ibmcloud fn namespace target ${namespace}

    rm -rf tmp
    mkdir tmp
    cd tmp
    zip action.zip ../action.js ../../github-sync.js
    cp ../package.json .
    npm install
    zip -rq action.zip *
    cd -

    action_cmd=create
    ibmcloud fn action get ${action_name} > /dev/null 2>&1 && action_cmd=update
    ibmcloud fn action ${action_cmd} ${action_name} tmp/action.zip --kind nodejs:default --param-file ${config_file}

    ibmcloud fn trigger get ${trigger_name} > /dev/null 2>&1  && ibmcloud fn trigger delete ${trigger_name}
    ibmcloud fn trigger create ${trigger_name} --param-file ${config_file} --feed /whisk.system/alarms/interval --param minutes 15

    ibmcloud fn rule get ${rule_name}  > /dev/null 2>&1 && ibmcloud fn rule delete ${rule_name}
    ibmcloud fn rule create ${rule_name} ${trigger_name} ${action_name}

    pre_fire_milliseconds=$(date +%s)000
    ibmcloud fn trigger fire ${trigger_name}

    wait_count=4
    activation_id=""
    set +x
    while [ "${activation_id}" == "" ] && [ ${wait_count} -gt 0 ]
    do
        activation_id=$(ibmcloud fn activation list ${action_name} -l 1  --since ${pre_fire_milliseconds} | grep ${action_name} | cut -d " " -f 3)
        if [ "${activation_id}" == "" ]; then
            wait_count=$(expr ${wait_count} - 1)
            echo "wait for trigger to fire...${wait_count} more tries"
            sleep 2
        fi
    done
    set -x

    if [ "${activation_id}" == "" ]; then
        echo "Function was not executed"
        echo "ibmcloud fn activation list ${action_name} -l 1  --since ${pre_fire_milliseconds}"
        ibmcloud fn activation list ${action_name} -l 1  --since ${pre_fire_milliseconds}
    else
        ibmcloud fn activation list ${action_name} -l 1 --since ${pre_fire_milliseconds}
        activation_id=$(ibmcloud fn activation list ${action_name} -l 1  | grep ${action_name} | cut -d " " -f 3)
        ibmcloud fn activation logs ${activation_id}
    fi
}


apikey=${IBM_CLOUD_API_KEY:-""}
create=0
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
    -r|--resource_group)
    resource_group=$1
    shift
    ;;
    -n|--namespace)
    namespace=$1
    shift
    ;;
    -h|--help)
    usage
    exit
    ;;
    -s|--setup)
    create=1
    ;;
    -v|--verbose)
    verbose=1
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

WORKDIR=`mktemp -d ` || exit 1
function cleanWorkDir() {
    if [ ! "$WORKDIR" == "" ]; then
        rm -rf $WORKDIR
    fi
}
trap cleanWorkDir EXIT

ibmcloud config --check-version=false
ibmcloud login --apikey ${apikey} -r ${region} -g ${resource_group} -a ${cloud_url}

if [ ${create} -eq 1 ]; then
    setup
fi
