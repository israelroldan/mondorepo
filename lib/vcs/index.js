const git = require('./git');

class VCS {
    static registerVCS (name, vcs) {
        let me = VCS;
        me._systems[name] = vcs;
        me[name] = (opts) => new me._systems[name](opts);
    }
}

VCS._systems = {};
VCS.registerVCS('git', git);

module.exports = VCS;