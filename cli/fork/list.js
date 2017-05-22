const BaseCommand = require('../base/command');
const columnify = require('columnify');
const chalk = require('chalk');

class list extends BaseCommand {
    execute (params) {
        let me = this;
        let forks = me.config.get('forks');

        if (forks && Object.keys(forks).length) {
            me.log.info(`The following forks are configured in your settings file.`);
            me.log.log('');
            /*
             * The following block outputs a table-like layout with widths based on the
             * number of columns in the tty write stream (process.stdout)
             *
             * By default `columnify` prints column headers in uppercase without divider
             * but I'm not a fan of that, hence the `headingTransform` functions below.
             */
            me.log.log(
                columnify(
                    forks,
                    {
                        columns: ['repo', 'fork'],
                        minWidth: (process.stdout.columns / 3),
                        maxLineWidth: 'auto',
                        config: {
                            repo: {
                                headingTransform: () => {
                                    return chalk.bold('Repository')+'\n···········';
                                },
                                maxWidth: (process.stdout.columns / 3)
                            },
                            fork: {
                                headingTransform: () => {
                                    return chalk.bold('Fork')+'\n·····';
                                },
                                maxWidth: (process.stdout.columns / 3)
                            }
                        }
                    }
                ).split('\n').map((l) => `  ${l}`).join('\n') // This indents the lines produced by `columnify`
            );
             me.log.log('');
             me.log.info(`Use ${chalk.bold.yellow('mondo fork (add|remove)')} to manage them.`);
        } else {
            me.log.info('There are no known forks in the global set');
        }
    }
}

list.define({
    help: 'Displays the global set of known forks'
});

module.exports = list;