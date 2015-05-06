'use strict';


var STATUS = require('../status');


exports.name      = 'MODE';
exports.auth      = false;
exports.pipeline  = false;
exports.validate  = /^READER$/i;

exports.run = function (request, data) {
  request.save(STATUS._201_SRV_READY_RO);
};
