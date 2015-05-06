'use strict';


var STATUS = require('../status');


exports.name      = 'QUIT';
exports.auth      = false;
exports.pipeline  = false;
exports.validate  = /^$/;

exports.run = function (request, data) {
  request.save(STATUS._205_QUIT);

  // TODO: A bit hacky
  setImmediate(function () {
    request.client.end();
  });
};
