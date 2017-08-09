const BaseCommand = require('./base/command');

const chalk = require('chalk');

const fs = require('fs');
const File = require('phylo');
const Repo = require('../src/repo');
const VCS = require('../src/vcs');
const Npm = require('../src/npm');

const {promiseSerial} = require('../src/Util');
const isWindows = /^win/.test(process.platform);

class install extends BaseCommand {
    execute (params) {
        let me = this;
        Repo.log = me.log;

        me.log.debug('Initializing git bridge');
        me.vcs = VCS.git({
            forks: params.forks ? me.config.get('forks') || {} : {},
            config: me.config,
            log: me.log,
            debug: me.root().params.debug
        });

        if (!me.vcs.available()) {
            throw new Error('Make sure `git` is available in your PATH');
        }

        me.log.debug('Initializing npm bridge');
        me.npm = new Npm({
            log: me.log,
            debug: me.root().params.debug
        });

        return me.installRepo().then((repo) => {
            let mondoverse = repo.allPackages;
            return promiseSerial(repo.packages.map(pkg => () => {
                me.log.debug(`Linking '${repo.name}:${pkg.name}' with ${mondoverse.length} known packages`);
                let dependencies = Object.keys(pkg.file.load().dependencies || {});
                let mondodeps = mondoverse.filter(p => !!~dependencies.indexOf(p.name) && !p.path.equals(pkg.path)).map(p => p.path.relativePath(pkg.path));
                mondodeps.forEach((p) => {
                    // TODO: Remove this once https://github.com/npm/npm/issues/17257 is dealt with
                    File.from(p).join('node_modules').remove('r');
                    File.from(p).join('package-lock.json').remove();
                });
                pkg.path.join('package-lock.json').remove();
                if (mondodeps.length > 0) {
                    return me.npm.install(pkg.path, {
                        save: false,
                        pkg: mondodeps.join(' ')
                    });
                } else {
                    return Promise.resolve(true);
                }
            }));
        });
    }

    installPackages (repo) {
        let me = this;
        me.log.info(`Installing packages for '${chalk.magenta(repo.name)}'`).indent();
        return promiseSerial(repo.packages.map(pkg => () => {
            me.log.info(`Installing '${chalk.magenta(repo.name)}:${chalk.yellow(pkg.name)}'`);
            return me.npm.install(pkg.path);
        })).then(() => {
            me.log.outdent();
            return repo
        });
    }

    installRepo (repo) {
        let me = this;
        let clone;

        if (!repo) {
            repo = Repo.open(File.cwd(), me.config).root;
        }

        if (repo.installed) {
            return Promise.resolve(repo);
        }

        repo.installed = true;       
        if (repo.exists()) {
            clone = Promise.resolve(repo);
        } else {
            clone = me.vcs.clone(repo.source.repository, repo.path, repo.source.branch);
        }
        return clone.then(() => me.installUsed(repo)).then(() => me.installPackages(repo));
    }

    installUsed (repo) {
        let me = this;
        me.writeManifestFile(repo);        
        repo.open();

        if (repo.uses.length > 0) {
            me.log.debug(`Installing repositories used by '${repo.name}'`);
            return promiseSerial(repo.uses.map(child => () => me.installRepo(child)))
                .then(() => repo);
        }
        return repo;
    }

    writeManifestFile (repo) {
        let me = this;
        let manifest = File.from(repo.path).join(me.config.get('child'));
        let rootPath = File.from(repo.path).relativize(File.cwd());
        if (repo.isRoot) {
            rootPath = true;
        }
        me.log.debug(`Writing manifest to '${manifest.path}'`);
        manifest.save({ root: rootPath });
    }
}

install.define({
    help: {
        '': 'Retrieves remote repositories and installs local dependencies',
        'forks': 'Obey local fork settings when downloading repos'
    },
    switches: '[forks:boolean=true]'
});

module.exports = install;
