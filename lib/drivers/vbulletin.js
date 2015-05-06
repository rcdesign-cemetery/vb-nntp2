'use strict';


var mysql = require('mysql'),
    http = require('http'),
    url = require('url'),
    assign = require('lodash').assign;


// internal helpers
////////////////////////////////////////////////////////////////////////////////

function date_format(s) {
  return 'DATE_FORMAT(' + s + ", '%a, %d %b %Y %T +0000')";
}

function convert_tz(s) {
  return 'CONVERT_TZ(' + s + ", 'SYSTEM', '+00:00')";
}

function adddate(s, d) {
  return 'ADDDATE(' + s + ', INTERVAL ' + (+d) + ' DAY)';
}

function int(s) {
  return (parseInt(s, 10) === +s) ? (+s) : (-1);
}

function escape(s) {
  return s.replace(/[\\"']/g, '\\$&').replace(/[\n]/g, '\\n')
          .replace(/[\r]/g, '\\r').replace(/\x00/g, '\\0');
}


function parse_db_url(u) {
  var parsed = url.parse(u, true, true);

  if (!parsed.slashes && u[0] !== '/') {
    u = '//' + u;
    parsed = url.parse(u, true, true);
  }

  parsed.host = parsed.host || 'loalhost';
  parsed.user = (parsed.auth || '').split(':')[0];
  parsed.password = (parsed.auth || '').split(':')[1];
  parsed.database = (parsed.pathname || '/').slice(1);

  return parsed;
}

// private methods: fn.call(this, *args)
////////////////////////////////////////////////////////////////////////////////

function kickBackend(callback) {
  var self = this, request, params;

  this.log.verbose('DATABASE kickBackend()');

  params = {
    host: this.__vbconfig.forum_host,
    port: this.__vbconfig.forum_port,
    path: '/nntpauth.php',
    method: 'GET'
  };

  this.log.debug('DATABASE kickBackend() request', params);
  request = http.request(params);

  request.on('response', function (response) {
    self.log.verbose('DATABASE kickBackend() response');

    response.setEncoding('utf8');
    response.on('data', function (chunk) {
      self.log.debug('DATABASE kickBackend() data', { chunk: chunk.toString() });

      if (chunk === 'Ok') {
        callback(null);
        return;
      }

      callback(new Error('Bad response from backend'));
    });
  });

  request.on('error', function (err) {
    callback(err);
  });

  // send request
  request.end();
}


/**
 * Try to fill `client.state` from db
 *
 * client.state.username & client.state.password must be filled
 */
function loadUser(client, callback) {
  var self = this;

  this.log.verbose('DATABASE loadUser()');

  // Both user record & group permissions must exist
  // JOIN guarantees that. If one absent, we should kick backend to build.
  self.db.query(
    'SELECT `U`.`usergroupslist`, `U`.`userid`, `G`.`nntpgroupslist`, ' +
    '       `G`.`template`, `G`.`css`, `G`.`menu` ' +
    '  FROM ' + this.__table('nntp_userauth_cache') + ' AS `U` ' +
    '  JOIN ' + this.__table('nntp_groupaccess_cache') + ' AS `G` ' +
    '    ON `U`.`usergroupslist` = `G`.`usergroupslist` ' +
    " WHERE `U`.`username` = '" + escape(client.state.username) + "' " +
    "   AND `U`.`authhash` = '" + escape(client.state.password) + "' " +
    "   AND `U`.`usergroupslist` != ''",
    function (err, rows) {
      var s;

      if (err || rows.length === 0) {
        callback(err, false);
        return;
      }

      s = {
        // should be first
        shared_id : rows[0].usergroupslist.replace(/,/, '_'),
        userid : rows[0].userid,
        css : rows[0].css,
        menu : rows[0].menu,
        template : rows[0].template,
        grp_ids : rows[0].nntpgroupslist,
        groups : {}
      };

      self.db.query(
        'SELECT `group_name`, `id` ' +
        '  FROM ' + self.__table('nntp_groups') +
        ' WHERE `id` IN (0,' + s.grp_ids + ') ' +
        ' GROUP BY `group_name`',
        function (err, rows) {
          if (err) {
            callback(err, false);
            return;
          }

          rows.forEach(function (row) {
            s.groups[row.group_name] = row.id;
          });

          Object.getOwnPropertyNames(s).forEach(function (k) {
            client.state[k] = s[k];
          });

          callback(null, true);
        }
      );
    }
  );
}


// public appublic api
////////////////////////////////////////////////////////////////////////////////

var VbDriver = module.exports = function VbDriver(config, log) {
  if (!(this instanceof VbDriver)) { return new VbDriver(config, log); }

  log.debug('DATABASE Initiating connection');

  this.__table_prefix = config.prefix || '';
  this.__vbconfig     = null;

  this.log            = log;
  this.config         = config;
};


VbDriver.prototype.__table = function (name) {
  return '`' + this.__table_prefix + name + '`';
};


VbDriver.prototype.init = function (callback) {
  var self = this;

  this.db = mysql.createPool(assign({}, parse_db_url(this.config.database), {
    connectionLimit: 4,
    insecureAuth: true
  }));

  this.db.on('error', function (err) {
    self.log(err);
  });

  this.__load_vb_config(callback);
};


VbDriver.prototype.__load_vb_config = function (callback) {
  var self = this, vbconfig = {}, config_map, config_keys, rows, parsed_url;

  this.log.verbose('DATABASE __load_vb_config()');

  config_map = {
    nntp_from_address: 'from_addr',
    bburl: 'forum_url',
    bbactive: 'active',
    nntp_message_in_list_timeout: 'msg_expires'
  };

  config_keys = Object.keys(config_map).map(function (k) {
    return "'" + k + "'";
  });

  this.db.query(
    'SELECT * ' +
    '  FROM ' + this.__table('setting') +
    ' WHERE `varname` IN (' + config_keys.join(',') + ')',
    function (err, rows) {
      if (err) {
        callback(err);
        return;
      }

      rows.forEach(function (row) {
        self.log.verbose('DATABASE __load_vb_config() row', {
          varname: row.varname,
          value: row.value
        });
        vbconfig[config_map[row.varname]] = row.value;
      });

      if (!vbconfig.from_addr) {
        callback(new Error("You should set 'From' field in NNTP vBulletin settings. " +
                        'For example: noreply@your.forum'));
        return;
      }

      if (vbconfig.forum_url) {
        parsed_url = url.parse(vbconfig.forum_url);
        vbconfig.forum_host = parsed_url.hostname;
        vbconfig.forum_port = +parsed_url.port || 80;
      }

      self.__vbconfig = vbconfig;
      callback();
    }
  );
};


/**
 * Get last/first groups stat from DB for all user groups
 */
VbDriver.prototype.getGroupsStat = function (valid_ids, callback) {
  this.log.verbose('DATABASE getGroupStat()');
  this.db.query(
    'SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` ' +
    '  FROM ' + this.__table('nntp_index') + ' AS `Index` ' +
    ' WHERE `groupid` IN (0,' + valid_ids + ') ' +
    ' GROUP BY `groupid`',
    callback
  );
};


/**
 * Get last/first/total for selected group from DB for all user groups
 */
VbDriver.prototype.getGroupInfo = function (group_id, callback) {
  this.log.verbose('DATABASE getGroupInfo()');
  this.db.query(
    'SELECT MIN( `messageid` ) AS `first`, ' +
    '       MAX( `messageid` ) AS `last`, ' +
    '       COUNT( `messageid` ) AS `total` ' +
    '  FROM ' + this.__table('nntp_index') + ' AS `Index` ' +
    ' WHERE `groupid` = ' + group_id + " AND `deleted` = 'no'",
    function (err, rows) {
      callback(err, rows ? rows.shift() : null);
    }
  );
};


/**
 * Load all headers info. Used in XOVER & XHDR
 */
VbDriver.prototype.getHeaders = function (group_id, range_min, range_max, callback) {
  this.log.verbose('DATABASE getHeaders()');
  this.db.query(
    'SELECT `title`, `groupid`, `messageid`, `messagetype`, `postid`, ' +
    '       `username`, `parentid` AS `refid`, ' + date_format(convert_tz('`datetime`')) + ' AS `gmdate` ' +
    '  FROM ' + this.__table('nntp_index') +
    ' WHERE `groupid` = ' + int(group_id) + " AND `deleted` = 'no' " +
    '   AND `messageid` >= ' + int(range_min) +
    '   AND `messageid` <= ' + int(range_max),
    callback
  );
};


/**
 * Get new groups list
 */
VbDriver.prototype.getNewGroups = function (valid_ids, time, callback) {
  this.log.verbose('DATABASE getNewGroups()');
  this.db.query(
    'SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` ' +
    '  FROM ' + this.__table('nntp_index') + ' AS `Index` ' +
    ' WHERE `groupid` IN (' +
    '         SELECT `id` ' +
    '           FROM ' + this.__table('nntp_groups') + ' ' +
    '          WHERE `id` IN(' + valid_ids + ') ' +
    "            AND `is_active` = 'yes' " +
    "            AND `date_create` >= '" + escape(time) + "' " +
    '       ) ' +
    ' GROUP BY `groupid`',
    callback
  );
};


/**
 * Load ARTICLE / HEAD / BODY data
 */
VbDriver.prototype.getArticle = function (group_id, article_id, callback) {
  this.log.verbose('DATABASE getArticle()');
  this.db.query(
    'SELECT `groupid`, `messageid`, `messagetype`, `body`, `username`, `postid`, ' +
    '       `parentid` AS `refid`, `title` AS `subject`, ' +
    '       ' + date_format(convert_tz('`datetime`')) + ' AS `gmdate`, ' +
    '       ' + date_format(adddate(convert_tz('`datetime`'), this.__vbconfig.msg_expires)) + ' AS `expires` ' +
    '  FROM ' + this.__table('nntp_index') +
    ' WHERE `groupid` = ' + int(group_id) + " AND `deleted` = 'no' " +
    '   AND messageid = ' + int(article_id),
    function (err, rows) {
      callback(err, rows ? rows.shift() : null);
    }
  );
};


/**
 * AUTH Check
 *
 * Check user login (nick|email) & password from client
 * Fill session records on success (groups, acceess_level, etc)
 */
VbDriver.prototype.checkAuth = function (client, callback) {
  var self = this;

  this.log.verbose('DATABASE checkAuth()');

  loadUser.call(self, client, function (err, loaded) {
    // (err, false) || (null, true)
    if (err || loaded) {
      callback(err, loaded);
      return;
    }

    self.db.query(
      'REPLACE INTO ' + self.__table('nntp_userauth_cache') +
      "    SET `username` = '" + escape(client.state.username) + "', " +
      "        `authhash` = '" + escape(client.state.password) + "', " +
      "        `usergroupslist` = '', `userid` = 0",
      function (err) {
        if (err) {
          callback(err, false);
          return;
        }

        kickBackend.call(self, function (err) {
          if (err) {
            callback(err, false);
            return;
          }

          loadUser.call(self, client, callback);
        });
      }
    );
  });
};
