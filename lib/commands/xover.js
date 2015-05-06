'use strict';


var STATUS = require('../status');


exports.name      = 'XOVER';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^((\d+)(-(\d+)?)?)?$/;

exports.run = function (request, data) {
  var self  = this,
      state = request.client.state,
      group_id, range_min, range_max;

  if (!state.current) {
    request.save(STATUS._412_GRP_NOT_SLCTD);
    return;
  }

  var params = data.match(exports.validate);

  if (!params[1]) {
    request.save(STATUS._420_ARTICLE_NOT_SLCTD);
    return;
  }

  group_id = state.groups[state.current];
  range_min = +params[2];
  range_max = params[3] ? (+params[4] || state.last) : range_min;

  self.driver.getHeaders(group_id, range_min, range_max, function (err, hdrs) {
    if (err) {
      self.log.error(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    if (!hdrs.length) {
      request.save(STATUS._423_NO_ARTICLE_IN_GRP);
      return;
    }

    var res = [ STATUS._224_OVERVIEW_INFO ];

    hdrs.forEach(function (hdr) {
      res.push([
        hdr.messageid,
        self.msgSubject(hdr.title),
        self.msgFrom(hdr.username),
        hdr.gmdate,
        self.msgIdString(hdr.postid, hdr.messagetype),
        self.msgReferers(hdr.refid, hdr.messagetype),
        '',
        self.msgXRef(state.current, hdr.messageid)
      ].join('\t'));
    });

    res.push('.');

    request.save(res);
  });
};
