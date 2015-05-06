'use strict';


var _      = require('lodash');
var STATUS = require('../status');


exports.name      = 'DATE';
exports.auth      = false;
exports.pipeline  = true;
exports.validate  = /^$/;


exports.run = function (request) {
  var now = new Date();

  request.save(
    STATUS._111_DATE +
    now.getUTCFullYear() +
    _.padLeft(now.getUTCMonth() + 1, 2, '0') +
    _.padLeft(now.getUTCDate(),      2, '0') +
    _.padLeft(now.getUTCHours(),     2, '0') +
    _.padLeft(now.getUTCMinutes(),   2, '0') +
    _.padLeft(now.getUTCSeconds(),   2, '0')
  );
};
