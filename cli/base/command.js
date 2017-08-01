const {Command} = require('switchit');

class BaseCommand extends Command {
    attach (parent) {
        super.attach(parent);
        let root = this.root();
        this.log = root.log;
        this.config = root.config;
        this.rootDir = root.rootDir;
        this.debug = root.debug;
        return this;
    }
}

module.exports = BaseCommand;
