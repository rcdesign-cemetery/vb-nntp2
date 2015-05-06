'use strict';


var STATUS = require('../status');


exports.name      = 'NEWGROUPS';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^(\d{6,8})\s+(\d{6})(?:\s+GMT)?$/;

exports.run = function (request, data) {
  var self   = this,
      state  = request.client.state,
      params = data.match(exports.validate);

  var d = params[1], t = params[2],
      dt = [ d.slice(0, -4), d.slice(-4, -2), d.slice(-2) ].join('-') + ' ' +
           [ t.slice(0, -4), t.slice(-4, -2), d.slice(-2) ].join(':');

  self.driver.getNewGroups(state.grp_ids, dt, function (err, rows) {
    if (err) {
      self.log.error(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    var res = [ STATUS._231_GRP_FOLLOWS ];

    Object.keys(state.groups).forEach(function (name) {
      var id = state.groups[name];
      if (rows[id]) {
        res.push([ name, rows[id].last, rows[id].first, 'n' ].join(' '));
      }
    });

    res.push('.');

    request.save(res);
  });
};
