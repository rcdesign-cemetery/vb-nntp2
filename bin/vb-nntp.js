#!/usr/bin/env node

'use strict';


var yaml = require('yaml');
var fs   = require('fs');
var path = require('path');


var configPath = path.join(__dirname, '../config.yml');

var config = yaml.safeLoad(fs.readFileSync(configPath));


if (require('cluster').isMaster) {
  require('../').startMaster(config);
} else {
  require('../').startWorker(config);
}
