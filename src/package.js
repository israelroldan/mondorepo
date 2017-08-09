const File = require('phylo');

const Collection = require('./collection.js');
const Graph = require('./graph.js');
const glob = require('glob');
const hashFiles = require('hash-files');
const semver = require('semver');
const JSON5 = require('json5');

class Package {
    constructor(packageFile, repo) {
        packageFile = File.from(packageFile).absolutify();

        if (!packageFile.isFile()) {
            packageFile = packageFile.join('package.json');
        }

        this._packageFile = packageFile;
        this._packagePath = packageFile.parent;
        this._package = packageFile.load() || {};
        this._mondo = (this._package && this._package.mondo) || {};
        this._basePath = this.path.join(this._mondo.base || '.');
        if (!this._package.version) {
            this._package.version = '0.0.0';
        }
        this._version = semver(this._package.version);
        this._repo = repo;
    }

    get name() {
        return this._package.name;
    }

    get version() {
        return this._version;
    }

    get private() {
        return this._package.private === true;
    }

    get path() {
        return this._packagePath;
    }

    get file() {
        return this._packageFile;
    }

    get base() {
        return this._basePath;
    }

    get package() {
        return this._package;
    }

    get hash() {
        if (!this._hash) {
            const files = glob.sync(this.path.join('**').path, {ignore: ['**/node_modules/**/*']});
            this._hash = hashFiles.sync({files: files});
        }

        return this._hash;
    }

    get mondoDependencies() {
        if (!this._mondoDependencies) {
            const deps = Object.keys(this._package.dependencies || {});
            this._mondoDependencies = new Collection();
            this._mondoDependencies.addAll(
                this.repo.root.allPackages
                    .filter(pkg => !!~deps.indexOf(pkg.name) && !pkg.path.equals(this.path))
            );
        }
        return this._mondoDependencies;
    }

    get allMondoDependencies() {
        let allMondoDependencies = this._allMondoDependencies;

        if (!allMondoDependencies) {
            const graph = new Graph(this);
            allMondoDependencies = this._allMondoDependencies = graph.depends;
        }

        return allMondoDependencies;
    }


    get _children() {
        return this.mondoDependencies;
    }

    get repo() {
        return this._repo;
    }

    publishify() {
        const pkg = JSON.parse(JSON.stringify(this.package));

        this.mondoDependencies.forEach(p => {
            pkg.dependencies[p.name] = `^${p.version}`;
        });

        pkg.mondo = {
            hash: pkg.hash
        };

        return pkg;
    }
}

module.exports = Package;
