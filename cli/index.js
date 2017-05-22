const File = require('phylo');

const {Container, commands} = require('switchit');
const Install = require('./install');
const Exec = require('./exec');
const Fork = require('./fork');
const Publish = require('./publish');
const Rev = require('./rev');
const FileUtil = require('../src/utils/FileUtil');
const constants = require('../src/constants');
const Util = require('../src/Util');

const Config = require('../lib/config');

class mondo extends Container {
    constructor () {
        super();
        this.config = new Config();
        this.config.set('pkg', this.rootDir.join('package.json').load());
    }

    execute (params, args) {
        let me = this;
        if (params.version) {
            me.log.log(me.config.get('pkg').version);
            return;
        } else if (params.help) {
            params.help = false;
            return super.execute(params, new args.constructor(['help']));
        } else if (params.debug) {
            me.log.setLogLevel('debug');
        }
        return super.execute(params, args);
    }
}

Object.assign(mondo.prototype, {
    log: require('loog')({ prefixStyle: 'ascii' }),
    rootDir: File.from(__dirname).up('package.json'),
});

mondo.define({
    help: {
        '': 'Management for collections of packages across teams',
        debug: 'Provide debug logging output',
        help: 'Show help'
    },
    switches: '[debug:boolean=false] [version:boolean=false] [help:boolean=false]',
    commands: {
        fork: Fork,
        help: commands.Help,
        install: Install,
        publish: Publish,
        rev: Rev
    }
});

module.exports = mondo;
