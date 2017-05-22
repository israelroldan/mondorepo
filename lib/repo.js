const File = require('phylo');
const Config = require('./config');

const Path = require('path');
const glob = require("glob");
const Package = require('./package');
const Collection = require('./collection.js');
const Graph = require('./graph');

const cfg = new Config();

class Repo {
    /**
     * @param manifestPath
     * @private
     */
    static getRepoPath(manifestPath) {
        let manifestDir = File.from(manifestPath);
        let parentDirectory = manifestDir.parent;
        let manifestFile = manifestDir.join(cfg.get('manifest'));
        let childFile = manifestDir.join(cfg.get('child'));

        // If there is a .mondo.json you are a Repo for sure
        if (childFile.exists()) {
            return manifestPath;
        }

        // check the package.json for declaration of mondo repo'ness
        if (manifestFile.exists()) {
            let json = manifestFile.load();
            let mondo = json.mondo || {};

            if (mondo[cfg.get('repo')]) {
                return manifestPath;
            }
        }

        if (parentDirectory === manifestPath) {
            return null;
        } else {
            return Repo.getRepoPath(parentDirectory);
        }
    }

    /**
     * @param {String} [repoPath] Optional path to open. Defaults to the current working directory.
     * @returns {Repo}
     */
    static open(repoPath = File.cwd()) {
        repoPath = File.from(repoPath).absolutify();
        repoPath = Repo.getRepoPath(repoPath);
        if (repoPath == null) {
            throw new Error('Repository not found. Are you missing the `repo: true` config?');
        }
        let repo = new Repo({path: repoPath});
        repo.open();

        return repo;
    }

    constructor(config) {
        this._registry = {};
        Object.assign(this, config);
    }

    /**
     * @property {Package[]} allPackages
     */
    get allPackages() {
        let allPackages = this._allPackages;

        if (!allPackages) {
            allPackages = this.packages.clone();
            let repos = this.uses;
            for (let repo of repos) {
                allPackages.addAll(repo.allPackages);
            }

            this._allPackages = allPackages;
        }

        return allPackages;
    }

    /**
     * @property {Object[]} allPackageAliases
     */
    get allPackageAliases() {
        let allPackageAliases = this._allPackageAliases;

        if (!allPackageAliases) {
            let allPackages = this.allPackages;
            allPackageAliases = this._allPackageAliases = {};
            allPackages.forEach(pkg => {
                this._allPackageAliases[pkg.name] = pkg.base;
            });
        }

        return allPackageAliases;
    }

    /**
     * @property {Repo[]} allRepos
     */
    get allRepos() {
        let allRepos = this._allRepos;

        if (!allRepos) {
            if (this.isRoot) {
                allRepos = new Collection();
                let getAllUses = (repo) => {
                    let uses = repo.uses;
                    if (uses && uses.length) {
                        for (let usedRepo of uses) {
                            if (!allRepos.get(usedRepo.name)) {
                                allRepos.add(usedRepo);
                                getAllUses(usedRepo);
                            }
                        }
                    }
                };

                getAllUses(this);
                this._allRepos = allRepos;
            } else {
                let root = this.root;
                return root.allRepos;
            }
        }

        return allRepos;
    }

    /**
     * @property {String} installDir
     */
    get installDir() {
        let root = this.root;

        if (root && root.manifest) {
            return root.path.join(root.manifest.install || cfg.get('install'));
        } else {
            throw new Error(`Unable to find root for Repositories or Root manifest is not set.`);
        }
    }

    /**
     * @property {boolean} isRoot
     */
    get isRoot() {
        return this.root === this;
    }

    /**
     * @property {Object} manifest
     */
    get manifest() {
        return this._manifest;
    }

    /**
     * @property {Object} mondo
     */
    get mondo() {
        if (this.manifest) {
            return this.manifest.mondo;
        }
    }

    /**
     * @property {String} name
     */
    set name(name) {
        if (this._name && this._name !== name) {
            throw new Error(`Inconsistent name for ${name}`);
        }

        this._name = name;
    }

    get name() {
        return this._name;
    }

    /**
     * @property {Package[]} packages
     */
    get packages() {
        let packages = this._packages;

        if (!packages) {
            let manifest = this.manifest;

            if (manifest) {
                let mondo = this.mondo || {};
                let directories = mondo.packages === false ? [] : mondo.packages || Array.from(cfg.get('packages'));
                let manifestPath = this.path;

                if (!Array.isArray(directories)) {
                    directories = [directories];
                }

                packages = new Collection();
                for (let packageDir of directories) {
                    let npmPackagesPaths;
                    packageDir = manifestPath.join(packageDir);

                    // test for self package root, allows for only one package
                    if (manifestPath.equals(packageDir)) {
                        npmPackagesPaths = [packageDir.join('package.json')];
                    } else {
                        npmPackagesPaths = packageDir.tips('package.json');
                    }

                    for (let npmPackagePath of npmPackagesPaths) {
                        let npmPackage = new Package(npmPackagePath, this);
                        packages.add(npmPackage);
                    }
                }

                this._packages = packages;
            } else {
                throw new Error(`Unable to get packages from a repo without path information. Configure 'path' for ${this.name}`);
            }
        }

        return packages;
    }

    /**
     * @property {File} path
     */
    get path() {
        return this._manifestPath;
    }

    set path(path) {
        let manifestPath = this._manifestPath = File.from(path).absolutify();

        if (manifestPath.name === cfg.get('manifest')) {
            this._manifestPath = manifestPath.parent;
            this._manifestFile = manifestPath;
        } else {
            this._manifestFile = manifestPath.join(cfg.get('manifest'));
        }
    }

    /**
     * @property {Repo} root
     */
    get root() {
        let root = this._root;

        if (!root) {
            let manifestPath = this.path;
            let mondoDescriptorFile = manifestPath.join(cfg.get('child'));

            // Does a mondo descriptor file exist for this repo
            if (mondoDescriptorFile.exists()) {
                let mondoDescriptor = mondoDescriptorFile.load();
                let rootRepoPath = manifestPath.join((mondoDescriptor.root === true ? '.' : mondoDescriptor.root) || '.');

                // Descriptor has a path pointing to the root repo
                if (!rootRepoPath.equals(manifestPath)) {
                    let rootRepoManifestFile = rootRepoPath.join(cfg.get('manifest'));
                    root = new Repo({path: rootRepoManifestFile});
                    root._root = root;
                    root.open();
                    root.registerRepo(this.name, this);
                }
            }

            this._root = root || (root = this);
        }

        return root;
    }

    /**
     * @property {Object} source
     * @property {String} source.repository
     * @property {String} source.branch
     */
    set source(source) {
        this._source = source;
    }

    get source() {
        return this._source;
    }

    /**
     * @property {Repo[]} uses
     */
    get uses() {
        let uses = this._uses;

        if (!uses) {
            let manifest = this.manifest;

            if (manifest) {
                let mondo = this.mondo;
                uses = new Collection();

                if (mondo) {
                    const manifestUses = mondo.uses || {};
                    const names = Object.keys(manifestUses);

                    names.forEach(name => {
                        const repo = this.resolveRepo(name, manifestUses[name]);
                        uses.add(repo);
                    });

                    this._uses = uses;
                }
            } else {
                throw new Error('Unable to get uses. Mondo Manifest is not set for this repo');
            }
        }

        return uses;
    }

    get _children() {
        return this.uses;
    }

    get allUses() {
        if (!this._allUses) {
            const graph = new Graph(this);
            this._allUses = graph.depends;
        }

        return this._allUses;
    }

    /**
     * @property {Package[]} visiblePackages
     */
    get visiblePackages() {
        let visiblePackages = this._visiblePackages;

        if (!visiblePackages) {
            let manifest = this.manifest;

            if (manifest) {
                visiblePackages = this.packages.clone();

                this.uses.forEach(repo => {
                    visiblePackages.addAll(repo.packages);
                });

                this._visiblePackages = visiblePackages;
            } else {
                throw new Error(`Unable to get visible packages from a repo without path information. Configure 'path' for '${this.name}'`);
            }
        }

        return visiblePackages;
    }

    /**
     * @returns {boolean}
     * @private
     */
    exists() {
        return this._manifestFile.exists();
    }

    /**
     * @param {string} name
     * @param {object} source
     * @private
     */
    resolveRepo(name, source) {
        let root = this.root;
        let registry = root._registry;
        let repo = registry[name];

        if (repo) {
            let existingSource = repo.source;

            if (!existingSource) {
                repo.source = source;
            } else if (source) {
                let sourceRepository = source.repository;
                let sourceBranch = source.branch;
                let existingSourceRepository = existingSource.repository;
                let existingSourceBranch = existingSource.branch;

                if (sourceRepository !== existingSourceRepository || sourceBranch !== existingSourceBranch) {
                    throw new Error(`'${name}' repo source mismatch. '${sourceRepository}@${sourceBranch}' mismatch '${existingSourceRepository}@${existingSourceBranch}`);
                }
            } else if (!repo.isRoot) {
                throw new Error(`Attempt to register a non-root Repo without source information. Configure 'source' for '${repo.name}'`);
            }
        } else {
            let installDir = this.installDir;
            let repoPath = installDir.join(name).join(cfg.get('manifest'));
            let config = {name, source: source, path: repoPath, _root: root};
            repo = new Repo(config);
            if (repo.exists()) {
                repo.open();
            }
            registry[name] = repo;
        }

        return repo;
    }

    /**
     * @param name {string}
     * @param repo {Repo}
     * @private
     */
    registerRepo(name, repo) {
        let registry = this.root._registry;

        if (registry[name]) {
            throw new Error(`Repo ${name} already registered`);
        }

        registry[name] = repo;
    }

    /**
     * @private
     */
    open() {
        if (!this._manifest) {
            if (this.exists()) {
                this._manifest = this._manifestFile.load();
                this.name = (this._manifest.mondo && this._manifest.mondo.name) || this._manifest.name;
            } else {
                throw new Error(`Unable to find Repo manifest at '${this._manifestFile}`);
            }
        }
    }
}

module.exports = Repo;
