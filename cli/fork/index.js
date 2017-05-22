const Container = require('switchit').Container;

const add = require('./add');
const list = require('./list');
const remove = require('./remove');

class fork extends Container {}

fork.define({
    help: 'Commands to manage the global set of known forks',
    commands: {
        '': 'list',
        add,
        list,
        remove
    }
});

module.exports = fork;