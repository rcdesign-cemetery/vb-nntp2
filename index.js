// Funtions to init cluster master/slave

'use strict';

var net     = require('net');
var tls     = require('tls');
var fs      = require('fs');
var cluster = require('cluster');

var logger  = require('./lib/logger');
var common  = require('./lib/common');
var Client  = require('./lib/client');
var Parser  = require('./lib/parser');


function createServer(config, parser, tracker, log) {
  if (!config.listen) { return null; }

  var bind, server;

  server = net.createServer();

  server.maxConnections = +config.max_conn || 50;

  bind = common.parseListenString(config.listen);

  server.listen(bind.port, bind.address);

  server.on('connection', function (socket) {
    tracker.plain++;

    var c = new Client(socket, parser, log);

    socket.on('close', function () {
      tracker.plain--;
      server.emit('free');
    });
  });

  log.info('VBNNTP Listening on', bind);

  return server;
}


function createSecureServer(config, parser, tracker, log) {
  if (!config.listen_ssl) { return null; }

  var bind, server;

  var options = {};
  options.key = options.cert = fs.readFileSync(config.pem_file);

  server = tls.createServer(options);

  server.maxConnections = +config.max_conn || 50;

  bind = common.parseListenString(config.listen_ssl);

  server.listen(bind.port, bind.address);

  server.on('connection', function (socket) {
    tracker.secure++;

    var c = new Client(socket, parser, log);

    socket.on('close', function () {
      tracker.secure--;
      server.emit('free');
    });
  });

  log.info('VBNNTP Listening on', bind);

  return server;
}


// MASTER
////////////////////////////////////////////////////////////////////////////////


function startMaster(config) {
  var ps_title = config.title || 'vbnntp',
      workers_amount = +config.workers || require('os').cpus().length,
      log = logger.create(config.logger),
      workers = [];

  // forks, configures and pushes new worker into the `workers` stack
  function addWorker() {
    var worker = cluster.fork();

    logger.listenSlaveLogger(worker, log);
    workers.push(worker);

    log.info('VBNNTP Worker added', { idx: workers.length, pid: worker.pid });
    worker.send({ title: ps_title + ' [worker:' + workers.length + ']' });
  }

  // --[ master events ]--------------------------------------------------------

  // when one of the workers dies, master get notifications with `death` event
  cluster.on('death', function (worker) {
    var idx = workers.indexOf(worker);

    // when existing (in the `workers` stack) worker dies - restart
    if (idx >= 0) {
      log.warn('VBNNTP Worker ' + worker.pid + ' died. Restarting...');
      delete workers[idx];
      // do not storm with worer recreation
      setTimeout(addWorker, 1000);
      return;
    }

    // not in the workers list (old worker) - let it go...
    log.info('VBNNTP Worker ' + worker.pid + ' stopped.');
  });

  // soft-restart all workers
  process.on('SIGHUP', function () {
    var old_workers = workers;

    log.info('VBNNTP Restarting workers');

    // start new workers
    workers = [];
    while (workers.length < workers_amount) {
      addWorker();
    }

    // request old workers to stop listen new connections
    old_workers.forEach(function (w) {
      w.send({ stop: true });
    });
  });

  // kill all workers and master
  process.once('SIGINT', function () {
    var worker;
    cluster.removeAllListeners('death');

    while (workers.length) {
      worker = workers.shift();

      // sometimes workers dies faster than master
      if (worker) {
        worker.kill('SIGINT');
      }

      worker = null;
    }

    process.exit(0);
  });

  // restart logger
  process.on('SIGUSR1', function () {
    log.info('VBNNTP Restarting logger');
    log.restart();
    log.info('VBNNTP Logger restarted');
  });

  // softly stop all workers and then kill em all with master
  process.once('SIGTERM', function () {
    var alive = workers.length;

    cluster.removeAllListeners('death');
    cluster.on('death', function () {
      alive--;

      if (alive === 0) {
        process.exit(0);
      }
    });

    while (workers.length) {
      workers.shift().send({ stop: true });
    }
  });

  // something went wrong - report error
  process.on('uncaughtException', function (err) {
    log.error('Unexpected exception: ' + common.dumpError(err));
  });

  // --[ start initial workers ]------------------------------------------------

  process.title = ps_title;
  log.info('VBNNTP Master started', { pid: process.pid });

  while (workers.length < workers_amount) {
    addWorker();
  }
}


// WORKER
////////////////////////////////////////////////////////////////////////////////


function startWorker(config) {
  var status, clients, servers, log, database, commander;

  clients   = { plain: 0, secure: 0 };
  servers   = { plain: null, secure: null };
  log       = logger.createSlaveLogger(process, config.logger.severity || 'INFO');

  // --[ worker events ]--------------------------------------------------------

  // got message from master
  process.on('message', function (cmd) {
    if (cmd.title) {
      process.title = cmd.title;
    } else if (cmd.stop) {
      log.debug('VBNNTP Stoppping worker', { pid: process.pid });
      process.title += ' (stopping)';

      Object.keys(servers).forEach(function (type) {
        if (!servers[type]) { return; }

        servers[type].removeAllListeners('connection');

        servers[type].on('free', function () {
          if (clients.plain === 0 && clients.secure === 0) {
            process.exit(0);
          }
        });

      });

      if (clients.plain === 0 && clients.secure === 0) {
        process.exit(1);
      }
    }
  });

  // got unhandled exception. report and terminate worker (it will be restrted
  // by master process.
  process.on('uncaughtException', function (err) {
    log.error('Unexpected exception: ' + common.dumpError(err));
  });

  //
  // Init componentes & run servers
  //

  // hardcode until single driver
  var driver = require('./lib/drivers/vbulletin')(config, log);

  driver.init(function (err) {
    if (err) {
      log.error('Driver init error: ' + common.dumpError(err));
      process.exit(100);
    }
    var parser = new Parser(config, driver, log);

    servers.plain  = createServer(config, parser, clients, log);
    servers.secure = createSecureServer(config, parser, clients, log);
  });
}


exports.startMaster = startMaster;
exports.startWorker = startWorker;
