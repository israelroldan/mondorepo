const BaseCommand = require('../base/command');
const chalk = require('chalk');

class Remove extends BaseCommand {
    execute (params) {
        let me = this;
        let forks = me.config.get('forks');

        if (!forks[params.repoName]) {
            me.log.info(`There is no known fork for ${chalk.bold.yellow(params.repoName)}.`);
            return;
        }

        let old = forks[params.repoName];
        delete forks[params.repoName];
        me.config.set('forks', forks);
        me.log.info(`Removed ${chalk.bold.yellow(old)} as known fork for ${chalk.bold.yellow(params.repoName)}.`);
    }
}

Remove.define({
    help: {
        '': 'Removes the known fork for a repository',
        repoName: 'The name of the repository'
    },
    parameters: '{repoName}'
});

module.exports = Remove;
