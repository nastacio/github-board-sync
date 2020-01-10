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
ibmcloud fn action update github-sync-test tmp/action.zip --kind nodejs:default --param-file ${config_file}
ibmcloud fn action invoke github-sync-test --param-file ${config_file} -r

ibmcloud fn trigger get github-sync-test-trigger && ibmcloud fn trigger delete github-sync-test-trigger
ibmcloud fn trigger create github-sync-test-trigger --param-file ${config_file} --feed /whisk.system/alarms/interval --param minutes 30
