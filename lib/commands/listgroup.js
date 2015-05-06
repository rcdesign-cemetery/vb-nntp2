'use strict';


var STATUS = require('../status');


exports.name      = 'LISTGROUP';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^([^\s]+)$/;

exports.run = function (request, data) {
  var self     = this,
      params   = data.match(exports.validate),
      group    = params[1],
      group_id = request.client.state.groups[group];

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

    // We can use more effective request, to get ids only. But who cares?
    // Command is quire rare, no need to optimize now.
    self.driver.getHeaders(group_id, first, last, function (err, hdrs) {
      if (err) {
        self.log.error(request.info(err));
        request.save(STATUS._403_FUCKUP);
        return;
      }

      var res = [ STATUS._211_GRP_SELECTED + [ total, first, last, group, 'list follows' ].join(' ') ];

      hdrs.forEach(function (hdr) {
        res.push(hdr.messageid);
      });

      res.push('.');

      request.save(res);
    });
  });
};
