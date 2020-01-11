set -x 
rm -rf tmp
mkdir tmp
cd tmp
zip action.zip ../action.js ../../github-sync.js
cp ../package.json .
npm install
zip -rq action.zip *
cd -

config_file=~/etc/github-sync-test.env
action_name=github-sync-test
trigger_name=${action_name}-trigger
rule_name=${action_name}-rule

action_cmd=create
ibmcloud fn action get ${action_name} && action_cmd=update
ibmcloud fn action ${action_cmd} ${action_name} tmp/action.zip --kind nodejs:default --param-file ${config_file}

ibmcloud fn trigger get ${trigger_name} && ibmcloud fn trigger delete ${trigger_name}
ibmcloud fn trigger create ${trigger_name} --param-file ${config_file} --feed /whisk.system/alarms/interval --param minutes 30

ibmcloud fn rule get ${rule_name} && ibmcloud fn rule delete ${rule_name}
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
