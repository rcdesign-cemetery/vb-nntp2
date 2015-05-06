'use strict';


var STATUS = require('../status');


exports.name      = 'LIST';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^$/;

exports.run = function (request, data) {
  var self  = this,
      state = request.client.state;

  self.driver.getGroupsStat(state.grp_ids, function (err, rows) {
    var groups = state.groups;

    if (err) {
      self.log.error(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    if (!groups) {
      self.log.error(new Error('cmdList() expects state to have groups'), request.info());
      request.save(STATUS._403_FUCKUP);
      return;
    }

    var res = [ STATUS._215_INFO_FOLLOWS ];

    Object.keys(state.groups).forEach(function (name) {
      var parts = [ name, 0, 0, 'n' ];

      if (rows[groups[name]]) {
        parts[1] = rows[groups[name]].last || 0;
        parts[2] = rows[groups[name]].first || 0;
      }

      res.push(parts.join(' '));
    });

    res.push('.');

    request.save(res);
  });
};
