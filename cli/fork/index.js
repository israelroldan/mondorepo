const Container = require('switchit').Container;

const Add = require('./add');
const List = require('./list');
const Remove = require('./remove');

class Fork extends Container {}

Fork.define({
    help: 'Commands to manage the global set of known forks',
    commands: {
        '': 'list',
        'add': Add,
        'list': List,
        'remove': Remove
    }
});

module.exports = Fork;
