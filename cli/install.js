const BaseCommand = require('./base/command');

const chalk = require('chalk');
const ora = require('ora');

const fs = require('fs');
const File = require('phylo');
const Repo = require('../lib/repo');
const VCS = require('../lib/vcs');
const PackageManagers = require('../src/PackageManagers');

const isWindows = /^win/.test(process.platform);

class install extends BaseCommand {
    execute(params) {
        let me = this;

        me.binDirs = [];
        me.wrappedBins = [];

        me.vcs = VCS.git({
            forks: params.forks ? me.config.get('forks') || {} : {}
        });

        if (!me.vcs.available()) {
            // TODO: Change error message based on selected vcs
            throw new Error('Git is required to run `mondo install`');
        }

        me.packageManager = (PackageManagers[me.config.get('packageManager')] || PackageManagers.yarn)();

        // Fallback to NPM when any package manager is not available
        if (!me.packageManager.available()) {
            me.log.debug('Global yarn not found, using npm instead.');
            me.packageManager = PackageManagers.npm();
        }

        const repo = Repo.open(process.cwd());
        return me.installRepo(repo.root).then(() => {
            if (me.wrappedBins.length > 0) {
                let message = 'Linking local binaries';
                me.log.debug(message);
                if (me.spinner) {
                    me.spinner.succeed();
                    me.spinner.text = message;
                    me.spinner.start();
                }

                let createWinBinary = (binDir, wrappedBin) => {
                    let binPath = binDir.join(wrappedBin.name + '.cmd');
                    let message = `Creating ${chalk.green(binPath.path)}`;

                    if (binPath.exists()) {
                        message = `Binary ${chalk.green(binPath.path)} already exists, overwriting`;
                        if (!me.spinner) {
                            me.log.warn(message);
                        }
                    }

                    me.log.debug(message);
                    binPath.save([
                        '@IF EXIST "%~dp0\\node.exe" (',
                        '  "%~dp0\\node.exe"  "%~dp0\\${wrappedBin.name}" %*',
                        ') ELSE (',
                        '  @SETLOCAL',
                        '  @SET PATHEXT=%PATHEXT:;.JS;=;%',
                        `  node  "%~dp0\\${wrappedBin.name}" %*`,
                        ')',
                        ''
                    ].join('\n'));
                    fs.chmodSync(binPath.path, '755');
                };

                let createUnixBinary = (binDir, wrappedBin) => {
                    let binPath = binDir.join(wrappedBin.name);
                    let message = `Creating ${chalk.green(binPath.path)}`;

                    if (binPath.exists()) {
                        message = `Binary ${chalk.green(binPath.path)} already exists, overwriting`;
                        if (!me.spinner) {
                            me.log.warn(message);
                        }
                    }

                    me.log.debug(message);
                    binPath.save([
                        '#! /usr/bin/env node',
                        `require('mondorepo/src/init');`,
                        `require('${wrappedBin.pkg.name}/${wrappedBin.file}');`,
                        ''
                    ].join('\n'));
                    fs.chmodSync(binPath.path, '755');
                };

                me.wrappedBins.forEach(function(wrappedBin) {
                    let message = `Linking '${chalk.green(wrappedBin.name)}'`;
                    me.log.debug(message);
                    if (me.spinner) {
                        me.spinner.succeed();
                        me.spinner.text = message;
                        me.spinner.start();
                    }
                    me.binDirs.forEach(function(binDir) {
                        binDir.mkdir();
                        createUnixBinary(binDir, wrappedBin);
                        if (isWindows) {
                            createWinBinary(binDir, wrappedBin);
                        }
                    });
                });
            }
            if (me.spinner) {
                me.spinner.succeed();
            }
        });
    }

    installRepo(repo) {
        let me = this;
        if (repo.installed) {
            return Promise.resolve(repo);
        }

        repo.installed = true;

        if (repo.exists()) {
            if (repo.isRoot) {
                File.from(repo.path)
                    .join(me.config.get('child'))
                    .save({
                        root: true
                    });
            }
            return me.installRepoPackages(repo);
        }

        let message = chalk.cyan(`Cloning repository '${chalk.magenta(repo.name)}' from '${chalk.yellow(repo.source.repository)}#${chalk.magenta(repo.source.branch || me.config.get('branch'))}' into '${chalk.magenta(repo.path.relativize(File.cwd()))}'`);
        me.log.debug(message);
        if (me.spinner) {
            me.spinner.succeed();
            me.spinner.text = message;
            me.spinner.start();
        }

        return me.vcs.clone(repo.source.repository, repo.path, repo.source.branch).then(() => {
            File.from(repo.path)
                .join(me.config.get('child'))
                .save({
                    root: File.from(repo.path).relativize(File.cwd())
                });
            return me.installRepoPackages(repo);
        });
    }

    installChildren(repo) {
        let me = this;
        let uses;

        for (let child of repo.uses) {
            if (uses) {
                uses = uses.then(() => me.installRepo(child));
            } else {
                uses = me.installRepo(child);
            }
        }

        if (uses) {
            return uses.then(() => repo);
        }

        return Promise.resolve(repo);
    }

    installRepoPackages(repo) {
        let me = this;
        repo.open();

        let message = `Installing packages for '${chalk.yellow(repo.name)}'`;
        me.log.debug(message);

        me.log.indent();
        if (!me.root().params.debug) {
            if (me.spinner) {
                me.spinner.succeed();
            } else {
                me.spinner = ora();
            }
            me.spinner.text = message;
            me.spinner.start();
        }
        let install = me.packageManager.install(repo.path);
        me.binDirs.push(File.from(repo.path).join('node_modules').join('.bin'));
        let packages = repo.packages;
        for (let pkg of packages) {
            install = install.then(() => {
                let message = `Installing '${chalk.yellow(repo.name)}:${chalk.magenta(pkg.name)}'`;
                me.log.debug(message);
                if (me.spinner) {
                    me.spinner.succeed();
                    me.spinner.text = message;
                    me.spinner.start();
                }

                return me.packageManager.install(pkg.path).then(() => {
                    me.binDirs.push(File.from(pkg.path).join('node_modules').join('.bin'));
                    let pkgJson = File.from(pkg.path).join('package.json').load();
                    if (pkgJson.bin) {
                        Object.keys(pkgJson.bin).forEach(function(name) {
                            me.wrappedBins.push({
                                pkg: pkg,
                                name: name,
                                file: pkgJson.bin[name]
                            });
                        });
                    }
                })
            });
        }

        // read the repo from the disk
        return install.then(() => {
            me.log.outdent();
            me.installChildren(repo);
        });
    }

}

install.define({
    help: {
        '': 'Brings the mondo in!',
        'forks': 'Enable local fork settings when downloading repos'
    },
    switches: '[forks:boolean=true]'
});

module.exports = install;
