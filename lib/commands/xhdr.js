'use strict';


var STATUS = require('../status');


exports.name      = 'XHDR';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^(FROM|SUBJECT|MESSAGE-ID|REFERENCES|DATE)(?:\s+(\d+)(-(\d+)?)?)?$/i;

exports.run = function (request, data) {
  var group_id, range_min, range_max,
      self   = this,
      state  = request.client.state,
      params = data.match(exports.validate);

  if (!state.current) {
    request.save(STATUS._412_GRP_NOT_SLCTD);
    return;
  }

  if (!params[2]) {
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

    var res = [ STATUS._221_HEAD_FOLLOWS ];
    var format = params[1].toUpperCase();

    hdrs.forEach(function (hdr) {
      switch (format) {
        case 'FROM':
          res.push([ hdr.messageid, self.msgFrom(hdr.username) ].join(' '));
          return;

        case 'SUBJECT':
          res.push([ hdr.messageid, self.msgSubject(hdr.title) ].join(' '));
          return;

        case 'MESSAGE-ID':
          res.push([ hdr.messageid, self.msgIdString(hdr.postid, hdr.messagetype) ].join(' '));
          return;

        case 'REFERENCES':
          res.push([ hdr.messageid, self.msgReferers(hdr.refid, hdr.messagetype) ].join(' '));
          return;

        case 'DATE':
          res.push([ hdr.messageid, hdr.gmdate ].join(' '));
          return;

        default:
          res.push(hdr.messageid);
          return;
      }
    });

    res.push('.');

    request.save(res);
  });
};
