// Client connection class.
// Keep session state, consume & pipeline commands
//
'use strict';


var Request = require('./request');
var STATUS = require('./status');


var CRLF = '\r\n';


function Client(socket, parser, log) {
  if (!(this instanceof Client)) { return new Client(socket, parser, log); }

  this.__socket   = socket;
  this.__parser   = parser;
  this.__buffer   = '';
  this.__commands = [];
  this.__pipeline = [];

  this.log        = log;

  // Connection state
  var state = {};

  state.ip        = socket.remoteAddress;
  state.current   = ''; // currently selected group name
  state.first     = 0;  // first msg id in current group
  state.last      = 0;  // last msg id in current group
  state.userid    = 0;
  state.username  = '';
  state.css       = {};
  state.menu      = {};
  state.template  = {};
  state.groups    = {};
  state.grp_ids   = {};

  this.state      = state;

  // socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60 * 1000);

  socket.on('data', this.__data.bind(this));

  socket.on('error', function () { socket.destroy(); });

  socket.on('timeout', function () { socket.destroy(); });

  log.debug('SERVER new connection from', { ip: state.ip });
  this.write(STATUS._201_SRV_READY_RO);
}


Client.prototype.__data = function (chunk) {
  this.__buffer += chunk;

  this.log.verbose('Input chunk: ' + chunk);

  // split on newlines
  var lines = this.__buffer.split(/\r?\n/);

  // keep the last partial line buffered
  this.__buffer = lines.pop();

  // push commands to queue
  if (lines.length) {
    Array.prototype.push.apply(this.__commands, lines);
    this.tick();
  }
};


// Emit string or array of strings & finish with CRLF
//
Client.prototype.write = function (data) {
  var out = (Array.isArray(data) ? data.join(CRLF) : data) + CRLF;

  this.log.verbose('Output: ' + out);

  this.__socket.write((Array.isArray(data) ? data.join(CRLF) : data) + CRLF);
  return this;
};


// End client session
//
Client.prototype.end = function (data) {
  if (data) {
    this.__socket.write(data);
  }
  this.__socket.end();
  this.__commands = [];
};


// Process enqueued commands & pipelined requests
//
Client.prototype.tick = function () {
  var request, command;

  // Send ready results.
  while (this.__pipeline.length && this.__pipeline[0].done) {
    this.write(this.__pipeline.shift().data);
  }

  //
  // TODO:
  //
  // - may be should force flush instead of .setNoDelay()
  // - set limit for max commands buffer & max pipeline buffer
  //

  // Run staked commands until possible
  for (;;) {
    if (!this.__commands.length) { break; }

    command = this.__commands[0];

    // if pipeline not empty, we an add only stakable commands
    if (this.__pipeline.length && this.__parser.notExclusive(command)) { break; }

    this.__commands.shift();

    request = new Request(this, command);

    this.__pipeline.push(request);
    this.__parser.process(request);
  }
};


module.exports = Client;
