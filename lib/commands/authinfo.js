'use strict';


var crypto = require('crypto');

var STATUS = require('../status');


exports.name      = 'AUTHINFO';
exports.auth      = false;
exports.pipeline  = false;
exports.validate  = /^(USER|PASS)\s+(.+)$/i;

exports.run = function (request, data) {
  var self   = this,
      params = data.match(exports.validate),
      state  = request.client.state;

  // Don't allow auth for already authorised client
  if (state.userid) {
    request.save(STATUS._502_CMD_UNAVAILABLE);
    return;
  }

  if (params[1].toUpperCase() === 'USER') {
    state.username = params[2];
    request.save(STATUS._381_AUTH_NEED_PASS);
    return;
  }

  // else arg = PASS
  if (!state.username) {
    request.save(STATUS._482_AUTH_OUT_OF_SEQ);
    return;
  }

  //
  // params validator allows params[1] to be either USER or PASS only
  //

  // TODO: store in more secure form
  state.password = crypto.createHash('md5').update(params[2]).digest('hex');

  self.log.debug('AUTHINFO Authenticating user', state.username);

  self.driver.checkAuth(request.client, function (err, verified) {
    if (err) {
      this.log(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    if (verified) {
      self.log.auth_debug('AUTHINFO Authentication success', state.username);
      request.save(STATUS._281_AUTH_ACCEPTED);
      return;
    }

    self.log.auth_debug('AUTHINFO Authentication failed', state.username);
    request.save(STATUS._481_AUTH_REJECTED);
  });
};
