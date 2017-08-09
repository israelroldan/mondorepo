const Config = require('../config');

class VCSBase {
    constructor (opts) {
        if (!opts.hasOwnProperty('config')) {
            opts.config = new Config();
        }
        Object.assign(this, opts);
    }

    process (repository, branch, path) {
        throw new Error("Not yet implemented");
    }

    available() {
        throw new Error("Not yet implemented");
    }
}

module.exports = VCSBase;
