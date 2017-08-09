const exec = require('child_process').execSync;
const chalk = require('chalk');
const SimpleGit = require('simple-git');
const File = require('phylo');

const VCSBase = require('./base');

class Git extends VCSBase {
    available() {
        try {
            exec('git --version');
            return true;
        } catch (e) {
            return false;
        }
    }

    clone (repoPath, path, branch = "master") {
        let me = this;
        return new Promise((resolve, reject) => {
            const fork = me.forks[repoPath];
            const originalRepoPath = repoPath;

            if (!fork) {
                me.log.error(`A fork of project '${repoPath}' could not be found.`);
                return reject(`Use ${chalk.yellow(`mondo fork add ${repoPath} <forkName>`)} to add one.`);
            }

            repoPath = fork;
            me.log.info(`Cloning '${chalk.yellow(originalRepoPath)}#${chalk.magenta(branch)}' into '${chalk.magenta(path.relativePath(File.cwd()))}'`);
            let simpleGit = SimpleGit();
            if (me.debug) {
                simpleGit.outputHandler((cmd, stdout, stderr) => {
                    stdout.on('data', (data) => {
                        me.log.indent().debug(`${data.toString()}`).outdent();
                    });
                    stderr.on('data', (data) => {
                        me.log.indent().debug(`${data.toString()}`).outdent();
                    });
                });
            }
            // SimpleGit().clone(`git@github.com:${repoPath}.git`, path, ['-b', branch, '--depth', '1', '--no-single-branch'], (err) => {
            simpleGit.clone(`git@github.com:${repoPath}.git`, path.path, ['-b', branch], (err) => {
                if (err) {
                    reject(err);
                } else {
                    if (fork) {
                        simpleGit = SimpleGit(path.path);
                        if (me.debug) {
                            simpleGit.outputHandler((cmd, stdout, stderr) => {
                                stdout.on('data', (data) => {
                                    me.log.indent().debug(`${data.toString()}`).outdent();
                                });
                                stderr.on('data', (data) => {
                                    me.log.indent().debug(`${data.toString()}`).outdent();
                                });
                            });
                        }
                        me.log.debug(`Fork Detected installing from '${chalk.yellow(repoPath)}#${chalk.magenta(branch)}' into '${path}'`);
                        simpleGit.addRemote(me.config.get('forkedRepoName'), `git@github.com:${originalRepoPath}.git`, (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                }
            });
        });
    }

    process (repository, path, branch) {
        return this.clone(repository, path, branch);
    }
}

module.exports = Git;
