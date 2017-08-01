const File = require('phylo');

const {Container} = require('switchit');
const Install = require('./install');
const Fork = require('./fork');
const Publish = require('./publish');
const Rev = require('./rev');

const Config = require('../lib/config');

class Mondo extends Container {
    constructor (log) {
        super();
        this.log = log || require('loog')({prefixStyle: 'ascii'});
    }

    configure (args) {
        if (!this.config) {
            this.config = new Config();
            this.config.set('pkg', this.rootDir.join('package.json').load());
        }
        return super.configure(args);
    }

    execute (params, args) {
        let me = this;
        if (params.debug) {
            me.log.setLogLevel('debug');
            me.debug = true;
        }
        return super.execute(params, args);
    }
}

Mondo.define({
    help: {
        '': 'Management for collections of packages across teams',
        debug: 'Provide debug logging output'
    },
    switches: '[debug:boolean=false]',
    commands: {
        'fork': Fork,
        'install': Install,
        'publish': Publish,
        'rev': Rev
    }
});

module.exports = Mondo;
