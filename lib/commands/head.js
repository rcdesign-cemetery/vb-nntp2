'use strict';


var STATUS = require('../status');
var head   = require('./helpers/article').head;


exports.name      = 'HEAD';
exports.auth      = true;
exports.pipeline  = true;
exports.validate  = /^(\d+)$/;

exports.run = function (request, data) {
  var self = this,
      state = request.client.state,
      group_id = state.groups[state.current];

  self.driver.getArticle(group_id, data, function (err, article) {
    if (err) {
      self.log.error(request.info(err));
      request.save(STATUS._403_FUCKUP);
      return;
    }

    if (!article) {
      request.save(STATUS._423_NO_ARTICLE_IN_GRP);
      return;
    }

    var res = [ STATUS._221_HEAD_FOLLOWS ];

    res = res.concat(head(article, self, request));
    res.push('.');

    request.save(res);
  });
};
