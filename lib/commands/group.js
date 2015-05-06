'use strict';


var STATUS = require('../status');


exports.name      = 'GROUP';
exports.auth      = true;
exports.pipeline  = false;
exports.validate  = /^(.+)$/;

exports.run = function (request, data) {
  var self     = this,
      params   = data.match(exports.validate),
      state    = request.client.state,
      group_id = state.groups[params[1]];

  if (!group_id) {
    request.save(STATUS._411_GRP_NOT_FOUND);
    return;
  }

  self.driver.getGroupInfo(group_id, function (err, info) {
    var first, last, total;

    if (err) {
      self.log.error(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    if (info) {
      first = info.first || 0;
      last = info.last || 0;
      total = info.total || 0;
    } else {
      first = last = total = 0;
    }

    state.current = params[1];
    state.first = first;
    state.last = last;

    request.save(STATUS._211_GRP_SELECTED + [ total, first, last, params[1] ].join(' '));
  });
};
