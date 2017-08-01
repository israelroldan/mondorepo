#!/usr/bin/env node
const File = require('phylo');
const isDebug = /-{1,2}de?b?u?g?\b/.test(process.argv[2]);
const log = require('loog')({
    prefixStyle: 'ascii',
    logLevel: isDebug ? 'debug' : 'info'
});

let cwd = File.cwd().upToDir('node_modules');
let Mondo, mondoCli;

while (cwd) {
    mondoCli = cwd.join("mondorepo/cli/index.js");
    if (mondoCli.exists()) {
        log.debug(`Using local version from ${mondoCli.path}`);
        Mondo = require(mondoCli.path);
        break;
    } else {
        cwd = cwd.parent && cwd.parent.parent ? cwd.parent.parent.parent.upToDir('node_modules') : null;
    }
}

if (!Mondo) {
    mondoCli = File.from(__dirname).parent.join("cli/index.js").absolutify();
    log.debug(`Using global version from ${mondoCli.path}`);
    Mondo = require(mondoCli.path);
}

new Mondo(log).run().catch(e => { 
    log.error(isDebug ? e.stack : (e.message ? e.message : e));
    process.exit(1);
});
