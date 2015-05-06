'use strict';


var STATUS = require('../status');


exports.name      = 'HELP';
exports.auth      = false;
exports.pipeline  = true;
exports.validate  = /^$/;

exports.run = function (request) {
  request.save([ STATUS._100_HELP_FOLLOWS, '.' ]);
};
