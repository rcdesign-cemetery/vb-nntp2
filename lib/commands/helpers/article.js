'use strict';


exports.head = function (article, parser, request) {
  var res = [];

  res.push('From: '       + parser.msgFrom(article.username));
  res.push('Newsgroups: ' + request.client.state.current);
  res.push('Subject: '    + parser.msgSubject(article.subject));
  res.push('Date: '       + article.gmdate);
  res.push('Message-ID: ' + parser.msgIdString(article.postid, article.messagetype));
  res.push('References: ' + parser.msgReferers(article.refid, article.messagetype));
  res.push('Expires: '    + article.expires);

  res.push('Content-Type: text/html; charset=utf-8');
  res.push('Content-Transfer-Encoding: base64');
  res.push('Charset: utf-8');

  res.push(parser.msgXRef(request.client.state.current, article.messageid));

  return res;
};


exports.body = function (article, parser, request) {
  var state = request.client.state,
      menu, text;

  menu = state.menu.split('<% POST ID %>').join(article.postid)
                   .split('<% THREAD ID %>').join(article.refid);

  text = state.template.replace('<% CSS %>', state.css)
                       .replace('<% USER MENU %>', menu)
                       .replace('<% MESSAGE BODY %>', article.body);

  // Cut long base64 string for short peaces
  // -- DON'T -- switch to plain text without tests on production!
  // Thunderbird seems to reload all plain messages in synced groups
  // for offline. No ideas why. Base64 partly solved problem.

  return (new Buffer(text)).toString('base64').match(/.{1,76}/g);
};
