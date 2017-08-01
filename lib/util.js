const Util = {
    /**
     * Receives an array of functions that in turn return a promise
     * Example:
     * 
     *      promiseSerial([
     *          () => new Promise((resolve, reject) => { console.log('Hello'); resolve(); }),
     *          () => new Promise((resolve, reject) => { console.log('How are you?'); resolve(); })
     *      ]).then(() => {
     *          console.log("Goodbye!");
     *      });
     */
    promiseSerial : (funcs) => 
        funcs.reduce((promise, func) => 
            promise.then(result => func().then(Array.prototype.concat.bind(result))),
                Promise.resolve([]))
};

module.exports = Util;
