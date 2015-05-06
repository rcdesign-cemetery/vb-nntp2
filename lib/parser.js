'use strict';


var _      = require('lodash');
var STATUS = require('./status');


function Parser(config, driver, log) {
  this.config   = config;
  this.driver   = driver;
  this.log      = log;
  this.hostname = config.hostname;

  this.commands = {};

  // Load commands

  var path = require('path').join(__dirname, 'commands');

  _.forEach(require('require-all')(path), function (cmd) {
    if (!cmd.run) { return; }

    this.commands[cmd.name] = {
      name:     cmd.name,
      auth:     cmd.auth,
      validate: function (data) {
                  return cmd.validate.test(data);
                },
      run:      cmd.run.bind(this)
    };
  }, this);
}


Parser.prototype.process = function (request) {
  var self = this,
      action = request.command.split(' ', 1)[0].toUpperCase(),
      params = request.command.slice(action.length).trim();

  this.log.verbose('Parse: ' + request.command, request.info());

  var cmd = this.commands[action];

  if (!cmd) {
    this.log.warn('Unknown command', request.info());
    request.save(STATUS._500_CMD_UNKNOWN);
    return;
  }

  if (!cmd.validate(params)) {
    this.log.warn('Invalid syntax', request.info());
    request.save(STATUS._501_SYNTAX_ERROR);
    return;
  }

  if (cmd.auth && !request.client.state.userid) {
    request.save(STATUS._480_AUTH_REQUIRED);
    return;
  }

  cmd.run(request, params);
};


// Check if command allows pipelining
//
Parser.prototype.notExclusive = function (str) {
  var name = str.split(' ', 1)[0].toUpperCase();

  return this.commands[name] && this.commands[name].pipeline;
};


// Build message "Subject" (UTF-8, Base64 encoding)
//
Parser.prototype.msgSubject = function (subject) {
  return '=?UTF-8?B?' +
         (new Buffer(_.unescape(subject))).toString('base64') +
         '?=';
};


// Build message field "From" (UTF-8, Base64 encoding)
//
Parser.prototype.msgFrom = function (username) {
  return '=?UTF-8?B?' +
         (new Buffer(_.unescape(username))).toString('base64') +
         '?= <no_reply@rcdesign.ru>';
};


// Build message id string as "<messageid>@<gateid>"
// Example: "5902@example.com"
//
Parser.prototype.msgIdString = function (msgId, msgType) {
  return '<' + msgId + '.' + msgType + '@' + this.hostname + '>';
};


// Build reference id string as "<referenceid>.ref@<gateid>"
// Example: "120.ref@example.com"
//
Parser.prototype.msgReferers = function (refererId, msgType) {
  return '<' + refererId + '.' + msgType + '.ref@' + this.hostname + '>';
};


// Build message field Xref
// Example: your.nntp.com cool.sex.binary:3748
//
Parser.prototype.msgXRef = function (group, msgId) {
  return 'Xref: ' + this.hostname + ' ' + group + ':' + msgId;
};


module.exports = Parser;
