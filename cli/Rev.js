const BaseCommand = require('./base/command');

const File = require('phylo');
const semver = require('semver');
const chalk = require('chalk');
const columnify = require('columnify');
const JSON5 = require('json5');
const jsonfile = require('jsonfile');

const Npm = require('../src/npm.js');
const Repo = require('../src/repo.js');
const Collection = require('../src/collection.js');

class RevPackage {
    constructor(pkg) {
        this._pkg = pkg;
        this._originalVersion = semver(this._pkg.version.raw);
        this._version = semver(this._pkg.version.raw);

        this.registry = false;
        this.alreadyPublished = false;
        this.globalVersionMatch = false;
        this.hashMatch = false;
        this._publishableDependencies = [];
    }

    set version(value) {
        this._version = value;
    }

    get version() {
        return this._version;
    }

    get originalVersion() {
        return this._originalVersion;
    }

    get hash() {
        return this._pkg.hash;
    }

    get originalVersion() {
        return this._originalVersion;
    }

    get package() {
        return this._pkg;
    }

    get name() {
        return this._pkg.name;
    }

    get shouldPublish() {
        return !this.hashMatch || this.hasDependencyOnPublishable;
    }

    get willErrorIfPublished() {
        return this.alreadyPublished;
    }

    get publishableDependencies() {
        return this._publishableDependencies;
    }

    get hasDependencyOnPublishable() {
        return this._publishableDependencies.length > 0;
    }

    addPublishableDependency(pkg) {
        if (!this._publishableDependencies.includes(pkg)) {
            this._publishableDependencies.unshift(pkg);
        }
    }
}


class Rev extends BaseCommand {
    execute(params) {
        let me = this;

        const path = params.path ? File.from(params.path).isAbsolute() ? File.from(params.path) : File.cwd().join(params.path) : File.cwd();
        const version = params.version.raw !== '0.0.0' ? params.version : false;
        const {preid, increment, recursive, 'dry-run': dry, 'check-modified': checkModified, 'check-existing': checkExisting} = params;
        const repo = Repo.open(path);

        me._revPackages = new Collection();
        me.checkModified = checkModified;
        me.checkExisting = checkExisting;
        me.dry = dry;

        me.npm = new Npm({
            log: me.log,
            debug: me.root().params.debug
        });

        // Get a list of all the this._revPackages we will be reving

        for (let pkg of (recursive ? repo.allPackages : repo.packages)) {
            me._revPackages.add(new RevPackage(pkg));
        }

        // Increment or set the version for this package in memory
        for (let revPkg of me._revPackages) {
            if (version) {
                if (semver.neq(revPkg.version, version)) {
                    revPkg.version = version;
                } else {
                    revPkg.globalVersionMatch = true;
                }
            } else {
                revPkg.version = semver(semver.inc(revPkg.version, increment, preid));
            }
        }

        return me.updateRegistryData()
            .then(me.updatePublishableDependencies.bind(me))
            .then(me.logRev.bind(me))
            .then(me.writeRev.bind(me));
    }

    updateRegistryData() {
        let me = this;
        const checkExisting = me.checkExisting;
        const checkModified = me.checkModified;

        if (checkExisting || checkModified) {
            return Promise.all(
                me._revPackages.map(revPkg => {
                    // Run NPM view over the package to get registry data
                    return me.npm.view(revPkg.name, revPkg.originalVersion)
                        .then(results => {
                            const registry = revPkg.registry = !!results ? JSON5.parse(results) : false;

                            // Check if the version we would like to rev to is already published for this package
                            if (registry) {
                                for (let version of registry.versions) {
                                    if (semver.eq(revPkg.version, version)) {
                                        revPkg.alreadyPublished = true;
                                    }
                                }
                            }

                            // Check if there is a fingerprint match for the package
                            if (checkModified) {
                                const mondo = registry.mondo || {};
                                if (revPkg.hash === mondo.hash) {
                                    revPkg.hashMatch = true;
                                }
                            }

                            // No entry for this package in the NPM registry
                        }).catch(() => {
                            //catch here though so the promise.all doesn't fail
                        });
                }));
        }

        return Promise.resolve();

    }

    updatePublishableDependencies() {
        const me = this;
        const _updateDependent = function(pkg) {
            pkg.allMondoDependencies.forEach(mondoPkg => {
                const revPackage = me._revPackages.get(pkg.name);
                const childRevPkg = me._revPackages.get(mondoPkg.name);

                if (childRevPkg && revPackage && childRevPkg.shouldPublish) {
                    revPackage.addPublishableDependency(mondoPkg);
                    _updateDependent(mondoPkg);
                }
            });
        };

        me._revPackages.forEach(revPkg => {
            _updateDependent(revPkg.package);
        });
    }

    logRev() {
        let me = this;
        const log = [];

        let statusRegExp = /^ (W|E) /g;
        let columns, statusRegExpResult, colorFunc;

        this._revPackages.forEach(revPackage => {
            const pkgLog = {
                name: revPackage.name,
                version: `${revPackage.version} (was ${revPackage.originalVersion})`,
            };
            let details = [];

            if ((this.checkExisting || this.checkModified) && revPackage.alreadyPublished) {
                pkgLog.status = 'W';
                details = [`${revPackage.version} is already published`];
            }else if (revPackage.globalVersionMatch) {
                pkgLog.status = 'W';
                details = [`${revPackage.version} is current package version`];
            } else {
                if (!this.checkModified) {
                    details.push('assumed changed');
                } else if (!revPackage.hashMatch) {
                    details.push('content changed');
                }

                if (revPackage.hasDependencyOnPublishable) {
                    const pkg = revPackage.publishableDependencies[0];
                    const numPkgs = revPackage.publishableDependencies.length;
                    details.push(`dependency change: ${pkg.name}${numPkgs > 1 ? ` and ${numPkgs - 1} other${numPkgs > 2 ? 's' : ''}` : ''}`);
                }
            }

            pkgLog.details = `(${details.join('; ')})`;

            log.push(pkgLog);
        });

        let colwidth = ((process.stdout.columns - 3) / 3);
        columns = columnify(log, {
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

    writeRev() {
        if (!this.dry) {
            this._revPackages.forEach(revPkg => {
                if (revPkg.shouldPublish) {
                    // Get the package manifest of a package :/
                    const pkg = revPkg.package;
                    const manifest = pkg.package;
                    manifest.version = revPkg.version.raw;
                    jsonfile.writeFileSync(pkg.path.join('package.json').path, manifest, {spaces: 4});
                }
            });
        }
    }
}

Rev.define({
    help: {
        '': 'Rev version of packages from the current repo',
        'dry-run': 'Show a summary of changes to perform, leaves everything intact',
        'check-existing': 'Compare against published versions in the npm registry',
        'check-modified': 'Compare against the hash of the latest published version',
        'recursive': 'Process all known packages (including those inside used repositories)',
        'increment': 'The increment to the version to apply (major, minor, patch, or prerelease)',
        'preid': 'Used when incrementing for a prerelease (eg. The "alpha" in 1.0.0-alpha.1)'
    },
    parameters: '[path=]',
    switches: `[dry-run:boolean=false]
               [check-existing:boolean=true]
               [check-modified:boolean=false]
               [recursive:boolean=false]
               [increment:string=patch]
               [preid:string=]
               [version:semver=0.0.0]`
});

module.exports = Rev;
