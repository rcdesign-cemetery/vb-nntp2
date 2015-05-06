'use strict';


var _ = require('lodash');


// list of non-enumerable fields of Error object (thanks to that smart ass who
// decided to hide them out in node >= 0.5.x) that we want to expose in logs
var ERR_FIELDS = [ 'code', 'stack' ];


// stringify error
exports.dumpError = function (err) {
  var str = err.message || err.toString();

  Object.keys(err).forEach(function (key) {
    if (ERR_FIELDS.indexOf(key) < 0) {
      str += '\n  ' + key + ': ' + err[key];
    }
  });

  ERR_FIELDS.forEach(function (key) {
    if (err[key]) {
      str += '\n  ' + key + ': ' + err[key];
    }
  });

  return str;
};


// parse strings `localhost:123` into hash of `{host: 'localhost', port: 123}`
exports.parseListenString = function (binding) {
  binding = binding.split(':');
  return (binding.length === 1) ? { address: '0.0.0.0',  port: +binding[0] }
                                : { address: binding[0], port: +binding[1] };
};
