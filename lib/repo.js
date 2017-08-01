const File = require('phylo');
const Config = require('./config');

const Path = require('path');
const glob = require("glob");
const Package = require('./package');
const Collection = require('./collection.js');
const Graph = require('./graph');

class Repo {
    //---------------------- Static Methods ----------------------//
    /**
     * @param manifestPath
     * @private
     */
    static getRepoPath(manifestPath, cfg = new Config()) {
        let log = Repo.getLogger();
        let manifestDir = File.from(manifestPath);
        
        if (!manifestDir) {
            return null;
        }

        log.debug(`Looking at ${manifestDir.path}`);
        log.indent();
        let parentDirectory = manifestDir.parent;
        let manifestFile = manifestDir.join(cfg.get('manifest'));
        let childFile = manifestDir.join(cfg.get('child'));

        // If there is a .mondo.json you are a Repo for sure
        if (childFile.exists()) {
            log.debug(`Found repo at ${childFile.parent}`);
            log.outdent();
            return manifestPath;
        }

        // check the package.json for declaration of mondo repo'ness
        if (manifestFile.exists()) {
            log.debug(`Found candidate manifest file: ${manifestFile.path}`);
            let json = manifestFile.load();
            let mondo = json.mondo || {};

            if (mondo[cfg.get('repo')]) {
                log.debug(`Repo found at ${manifestPath.path}`)
                log.outdent();
                return manifestPath;
            }
        }

        if (parentDirectory === manifestPath) {
            log.outdent();
            return null;
        } else {
            log.outdent();
            return Repo.getRepoPath(parentDirectory, cfg);
        }
    }

    /**
     * @param {String} [repoPath] Optional path to open. Defaults to the current working directory.
     * @returns {Repo}
     */
    static open(repoPath = File.cwd(), cfg = new Config()) {
        let log = Repo.getLogger();
        repoPath = File.from(repoPath).absolutify();
        log.debug(`Looking for a repo, starting from ${repoPath.path}`);
        log.indent();
        repoPath = Repo.getRepoPath(repoPath, cfg);
        log.outdent();
        if (repoPath == null) {
            throw new Error('Repository not found. Are you missing the `repo: true` config?');
        }
        let repo = new Repo({path: repoPath, config: cfg});
        repo.open();

        return repo;
    }

    static getLogger() {
        if (!Repo.log) {
            Repo.log = require('loog')({
                prefixStyle: 'ascii'
            });
        }
        return Repo.log;
    }

    //---------------------- Constructor ----------------------//

    constructor(config) {
        this._registry = {};
        if (!config.hasOwnProperty('config')) {
            config.config = new Config();
        }
        this.config = config.config;
        this.log = Repo.getLogger();
        Object.assign(this, config);
    }

    //---------------------- Getters and Setters ----------------------//

    /**
     * @property {Package[]} allPackages
     */
    get allPackages() {
        let me = this;
        let allPackages = me._allPackages;

        if (!allPackages) {
            allPackages = me.packages.clone();
            let repos = me.uses;
            for (let repo of repos) {
                allPackages.addAll(repo.allPackages);
            }

            me._allPackages = allPackages;
        }

        return allPackages;
    }

    /**
     * @property {Object[]} allPackageAliases
     */
    get allPackageAliases() {
        let me = this;
        let allPackageAliases = me._allPackageAliases;

        if (!allPackageAliases) {
            let allPackages = me.allPackages;
            allPackageAliases = me._allPackageAliases = {};
            allPackages.forEach(pkg => {
                me._allPackageAliases[pkg.name] = pkg.base;
            });
        }

        return allPackageAliases;
    }

    /**
     * @property {Repo[]} allRepos
     */
    get allRepos() {
        let me = this;
        let allRepos = me._allRepos;

        if (!allRepos) {
            if (me.isRoot) {
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

                getAllUses(me);
                me._allRepos = allRepos;
            } else {
                let root = me.root;
                return root.allRepos;
            }
        }

        return allRepos;
    }

    /**
     * @property {String} installDir
     */
    get installDir() {
        let me = this;
        let root = me.root;

        if (root && root.manifest) {
            return root.path.join(root.manifest.install || me.config.get('install'));
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
        return this.manifest ? this.manifest.mondo : undefined;
    }

    /**
     * @property {String} name
     */
    set name(name) {
        if (name) {
            this._name = name;
        }
    }

    get name() {
        return this._name;
    }

    /**
     * @property {Package[]} packages
     */
    get packages() {
        let me = this;
        let packages = me._packages;

        if (!packages) {
            let manifest = me.manifest;

            if (manifest) {
                let mondo = me.mondo || {};
                let directories = mondo.packages === false ? [] : mondo.packages || Array.from(me.config.get('packages'));
                let manifestPath = me.path;

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
                        let npmPackage = new Package(npmPackagePath, me);
                        packages.add(npmPackage);
                    }
                }

                me._packages = packages;
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
        let me = this;
        let manifestPath = me._manifestPath = File.from(path).absolutify();

        if (manifestPath.name === me.config.get('manifest')) {
            me._manifestPath = manifestPath.parent;
            me._manifestFile = manifestPath;
        } else {
            me._manifestFile = manifestPath.join(me.config.get('manifest'));
        }
    }

    /**
     * @property {Repo} root
     */
    get root() {
        let me = this;
        let root = me._root;

        if (!root) {
            let manifestPath = me.path;
            let mondoDescriptorFile = manifestPath.join(me.config.get('child'));

            // Does a mondo descriptor file exist for this repo
            if (mondoDescriptorFile.exists()) {
                let mondoDescriptor = mondoDescriptorFile.load();
                let rootRepoPath = manifestPath.join((mondoDescriptor.root === true ? '.' : mondoDescriptor.root) || '.');

                // Descriptor has a path pointing to the root repo
                if (!rootRepoPath.equals(manifestPath)) {
                    let rootRepoManifestFile = rootRepoPath.join(me.config.get('manifest'));
                    root = new Repo({path: rootRepoManifestFile, config: me.config});
                    root._root = root;
                    root.open();
                    root.registerRepo(me.name, me);
                }
            }

            me._root = root || (root = me);
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
        let me = this;
        let uses = me._uses;

        if (!uses) {
            let manifest = me.manifest;

            if (manifest) {
                let mondo = me.mondo;
                uses = new Collection();

                if (mondo) {
                    const manifestUses = mondo.uses || {};
                    const names = Object.keys(manifestUses);

                    names.forEach(name => {
                        const repo = me.resolveRepo(name, manifestUses[name]);
                        uses.add(repo);
                    });

                    me._uses = uses;
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
        let me = this;
        if (!me._allUses) {
            const graph = new Graph(me);
            me._allUses = graph.depends;
        }

        return me._allUses;
    }

    /**
     * @property {Package[]} visiblePackages
     */
    get visiblePackages() {
        let me = this;
        let visiblePackages = me._visiblePackages;

        if (!visiblePackages) {
            let manifest = me.manifest;

            if (manifest) {
                visiblePackages = me.packages.clone();

                me.uses.forEach(repo => {
                    visiblePackages.addAll(repo.packages);
                });

                me._visiblePackages = visiblePackages;
            } else {
                throw new Error(`Unable to get visible packages from a repo without path information. Configure 'path' for '${me.name}'`);
            }
        }

        return visiblePackages;
    }

    //---------------------- Instance Methods ----------------------//

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
        let me = this;
        let root = me.root;
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
            let installDir = me.installDir;
            let repoPath = installDir.join(name).join(me.config.get('manifest'));
            repo = new Repo({
                name,
                source: source,
                path: repoPath,
                _root: root,
                config: me.config
            });
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
        let me = this;
        me.log.debug(`Opening repo from ${me._manifestFile}`);
        if (!me._manifest) {
            me._manifestFile = me._manifestPath.join(me.config.get('manifest'));
            if (me.exists()) {
                me._manifest = me._manifestFile.load();
                me.name = (me._manifest.mondo && me._manifest.mondo.name) || me._manifest.name;
            } else {
                throw new Error(`Unable to find Repo manifest at '${me._manifestFile}`);
            }
        }
    }
}

module.exports = Repo;
