#!/usr/bin/env node
const File = require('phylo');

let cwd = File.cwd().upTo('node_modules');
let Mondo, mondoCli;

while (cwd) {
    mondoCli = cwd.join("mondorepo").join("cli").join("index.js");
    if (mondoCli.exists()) {
        Mondo = require(mondoCli.path);
        break;
    } else {
        cwd = cwd.parent && cwd.parent.parent ? cwd.parent.parent.parent.upTo('node_modules') : null;
    }
}

if (!Mondo) {
    mondoCli = File.from(__dirname).parent.join("cli").join("index.js").absolutify();
    Mondo = require(mondoCli.path);
}

const mondo = new Mondo();
mondo.run().catch(e => { 
    mondo.log.error(/-{1,2}de?b?u?g?\b/.test(process.argv[2]) ? e.stack : e.message ? e.message : e);
    process.exit(1);
});
