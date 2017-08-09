const BaseCommand = require('./base/command');

const File = require('phylo');
const semver = require('semver');
const chalk = require('chalk');
const columnify = require('columnify');
const JSON5 = require('json5');

const Npm = require('../src/npm.js');
const Repo = require('../src/repo.js');
const Collection = require('../src/collection.js');

const isWindows = /^win/.test(process.platform);

class Publish extends BaseCommand {
    execute(params) {
        let me = this;

        const {recursive, 'dry-run': dry, script, 'check-existing': checkExisting} = params;
        const path = params.path ? File.from(params.path).isAbsolute() ? File.from(params.path) : File.cwd().join(params.path) : File.cwd();
        const repo = Repo.open(path);

        me.publisher = new Npm({
            log: me.log,
            debug: me.root().params.debug
        });

        me._packages = new Collection();

        me.hasPublishConflict = false;
        me.dry = script ? false : dry;
        me.script = script;
        me.checkExisting = checkExisting;

        // Get a list of all the packages we will be publishing
        for (let pkg of (recursive ? repo.allPackages : repo.packages)) {
            if (!pkg.private) {
                me._packages.add(pkg);
            }
        }

        if (checkExisting) {
            return me.doCheckExisting()
                .then(() => {
                    if (me.dry || me.hasPublishConflict) {
                        me.writeSummary();
                    } else if (script) {
                        me.writeScript();
                    } else {
                        me.writeSummary();
                        return me.publish();
                    }
                });
        } else {
            if (script) {
                me.writeScript();
            } else {
                me.writeSummary();
                return me.publish();
            }
        }
    }

    doCheckExisting() {
        return Promise.all(
            this._packages.map(pkg => {
                // Run NPM view over the package to get registry data
                return this.publisher.view(pkg.name, pkg.version)
                    .then(results => {
                        const registry = pkg.$$registry = !!results ? JSON5.parse(results) : false;

                        // Check if the version we would like to rev to is already published for this package
                        if (registry) {
                            pkg.$$alreadyPublished = true;
                        } else {
                            pkg.$$alreadyPublished = false;
                        }


                        // Check if there is a fingerprint match for the package
                        const mondo = registry.mondo || {};
                        if (pkg.hash === mondo.hash) {
                            pkg.$$hashMatch = true;
                        }

                        if (pkg.$$alreadyPublished && !pkg.$$hashMatch) {
                            this.hasPublishConflict = true;
                        }

                    }).catch(() => {
                        pkg.$$neverPublished = true;
                        //catch here though so the promise.all doesn't fail
                    });
            }));
    }

    writeSummary () {
        let me = this;
        let columns = Array.from(this._packages.items);
        let statusRegExp = /^ (W|E) /g;
        let statusRegExpResult, colorFunc;

        columns.map(column => {
            if (column.$$alreadyPublished && !column.$$hashMatch) {
                column.status = 'E';
                column.details = `This version is already published to the NPM Registry is locally modified`;
            } else if (column.$$alreadyPublished === false) {
                column.details = `OK`;
            } else if (column.$$neverPublished) {
                column.details = `OK (first publish)`;
            } else {
                column.details = `Unknown published status`;
            }
        });

        let colwidth = ((process.stdout.columns - 3) / 3);
        columns = columnify(columns, {
            showHeaders: true,
            minWidth: colwidth,
            maxLineWidth: 'auto',
            config: {
                status: {
                    align: 'center',
                    headingTransform: () => 'S\n···',
                    minWidth: 3
                },
                name: {
                    headingTransform: () => chalk.bold('Name')+'\n····',
                    maxWidth: colwidth
                },
                version: {
                    headingTransform: () => chalk.bold('Version')+'\n·······',
                    maxWidth: colwidth
                },
                details: {
                    headingTransform: () => chalk.bold('Details')+'\n·······'
                }
            },
            columns: ['status', 'name', 'version', 'details']
        });

        // Color any Warnings or Errors
        columns = columns.split('\n')
            .map(row => {
                statusRegExpResult = statusRegExp.exec(row);
                if (statusRegExpResult) {
                    colorFunc = statusRegExpResult[1] === 'W' ? chalk.yellow : chalk.red;
                    return colorFunc(row);
                }
                return row;
            });

        columns.forEach(l => me.log.log(l));
    }

    publish() {
        // Shortcut to chain then's of promises from an array
        return this._packages.reduce((promise, pkg) => {
            return promise.then(() => {
                const json = pkg.publishify();
                const original = pkg.file.load();
                jsonfile.writeFileSync(pkg.file.path, json, {spaces: 4});
                return this.publisher.publish(pkg.path).then(r => {
                    pkg.file.save(original);
                    return r;
                }).catch(err => {
                    pkg.file.save(original);
                    if (this.checkExisting || !err.message.includes('You cannot publish over the previously published version')) {
                        throw err;
                    } else {
                        return this.publisher.view(pkg.name, pkg.version).then(results => {
                            const registry = !!results ? JSON5.parse(results) : false;

                            const mondo = registry.mondo || {};
                            if (pkg.hash !== mondo.hash) {
                                throw new Error(`${pkg.name} at version ${pkg.version} is already published to NPM and has changed locally.`);
                            }
                            // No entry for this package in the NPM registry
                        });
                    }
                });
            });
        }, Promise.resolve());
    }

    writeScript() {
        let me = this;
        const prefix = isWindows ? 'REM' : '#';
        this._packages.forEach(pkg => {
            if (!pkg.$$alreadyPublished) {
                me.log.log(`npm publish ${pkg.path}`);
            } else {
                me.log.log(`${prefix} Version already exists for ${pkg.name}`);
                me.log.log(`${prefix} npm publish ${pkg.path}`);
            }
        });
    }
}

Publish.define({
    help: {
        '': 'Rev version of packages from the current repo',
        'dry-run': 'Show a summary of changes to perform, leaves everything intact',
        'script': 'Outputs a script to perform the operations manually',
        'check-existing': 'Compare against published versions in the npm registry',
        'recursive': 'Process all known packages (including those inside used repositories)'
    },
    parameters: '[path=]',
    switches: '[dry-run:boolean=false] [script:boolean=false] [check-existing:boolean=true] [recursive:boolean=false]'
});


module.exports = Publish;
