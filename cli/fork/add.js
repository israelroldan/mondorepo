const BaseCommand = require('../base/command');
const chalk = require('chalk');

class Add extends BaseCommand {
    execute (params) {
        let me = this;
        let forks = me.config.get('forks') || {};

        let replace = false;
        if (forks[params.repoName]) {
            if (params.force) {
                replace = true;
                me.log.warn(`Replacing ${chalk.bold.yellow(forks[params.repoName])} with ${chalk.bold.yellow(params.forkName)} as fork for ${chalk.bold.yellow(params.repoName)}.`);
            } else {
                me.log.error(`${chalk.bold.yellow(forks[params.repoName])} is already configured as fork for ${chalk.bold.yellow(params.repoName)}.`);
                if (forks[params.repoName] !== params.forkName) {
                    me.log.error(`Use ${chalk.bold.yellow('--force')} to overwrite it.`);
                }
                return;
            }
        }

        forks[params.repoName] = params.forkName;
        me.config.set('forks', forks);
        if (!replace) {
            me.log.info(`Added ${chalk.bold.yellow(params.forkName)} as known fork for ${chalk.bold.yellow(params.repoName)}.`);
        }
    }
}

Add.define({
    help: {
        '': 'Sets the fork to use for a given repository',
        repoName: 'The name of the repository',
        forkName: 'The fork to use (when referring to that repository)',
        force: 'Overwrite existing values'
    },
    switches: '[force:boolean=false]',
    parameters: '{repoName} {forkName}'
});

module.exports = Add;
