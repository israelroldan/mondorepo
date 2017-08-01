const chalk = require('chalk');
const spawn = require('child_process').spawn;
const File = require('phylo');

const isWindows = /^win/.test(process.platform);
const npm = `npm${isWindows ? '.cmd' : ''}`;

class Npm {
    constructor (opts) {
        Object.assign(this, opts);
    }

    spawn(args, options) {
        return new Promise((resolve, reject) => {
            let process = spawn(npm, args, options);

            process.on('close', (code) => {
                if (code) {
                    reject(new Error(`NPM ${args.join(' ')} exited with code: ${code}`));
                } else {
                    resolve();
                }
            });

            process.on('error', reject);
        });
    }

    install (cwd, opts) {
        cwd = File.from(cwd);
        opts = opts || {};

        let me = this;
        let args = ['install'];
        // TODO: Revisit this once https://github.com/npm/npm/issues/17257 is dealt with
        args.push('--no-shrinkwrap');
        if ('save' in opts) {
            args.push(`--${!opts.save ? 'no-' : ''}save${!!opts.save ? `-${opts.save === true ? 'prod' : opts.save}` : ''}`);
        }
        if ('pkg' in opts) {
            args = args.concat(opts.pkg.split(' '));
        }
        me.log.debug(`Running 'npm ${args.join(' ')}' at ${cwd}`);
        return me.spawn(args, {
            cwd: cwd.path,
            stdio: me.debug ? 'inherit' : 'pipe'
        });
    }

    view(name, version) {
        const pkg = name + (version !== undefined ? `@${version}` : '');
        return this.spawn(['view', pkg, '--json']);
    }

    publish(path) {
        return this.spawn(['publish'], {
            cwd: path
        });
    }
}

module.exports = Npm;
