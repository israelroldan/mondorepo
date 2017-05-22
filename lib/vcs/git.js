const exec = require('child_process').execSync;
const chalk = require('chalk');
const SimpleGit = require('simple-git');

const VCSBase = require('./base');

const Config = require('../config');
const config = new Config();
const log = require('loog');

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

            if (fork) {
                repoPath = fork;
                log.debug(`Fork Detected installing from '${chalk.yellow(repoPath)}#${chalk.magenta(branch)}' into '${path}'`);
            }

            // SimpleGit().clone(`git@github.com:${repoPath}.git`, path, ['-b', branch, '--depth', '1', '--no-single-branch'], (err) => {
            SimpleGit().clone(`git@github.com:${repoPath}.git`, path.path, ['-b', branch], (err) => {
                if (err) {
                    reject(err);
                } else {
                    if (fork) {
                        SimpleGit(path.path).addRemote(config.get('forkedRepoName'), `git@github.com:${originalRepoPath}.git`, (err) => {
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
