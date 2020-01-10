const ghsync = require('./github-sync.js');

/**
 * Main function for OpenWhisk
 * @param {*} config 
 */
async function owSync(config) {
  return await ghsync(config);
}
exports.main = owSync;
