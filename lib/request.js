// Class to store command results.
// Used for pipelined processing.
//
'use strict';

var _         = require('lodash');
var dumpError = require('./common').dumpError;


function Request(client, command) {
  this.client  = client;
  this.command = command;
  this.done   = false;
  this.data    = null;
}


Request.prototype.save = function (data) {
  this.data = data;
  this.done = true;
  this.client.tick();
};


// Generate info object for logger
Request.prototype.info = function (err) {
  var info = _.pick(this.client.state, [ 'ip', 'current', 'username', 'userid' ]);

  info.command = this.command;

  if (err) {
    info.error = dumpError(err);
  }

  return info;
};


module.exports = Request;
