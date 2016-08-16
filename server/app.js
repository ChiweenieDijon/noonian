/*
Copyright (C) 2016  Eugene Lockett  gene@noonian.org

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';

/**
* server/app.js
*   SERVER ENTRY POINT
**/

var fs = require('fs');
var express = require('express');

var conf = require('./conf');

//Read commandline args
var commandline = {};

var args = process.argv;
if(args.length > 1) {
  for(var i=0; i < args.length - 1; i++) {
    if(args[i].indexOf('--') === 0) {
      commandline[args[i].substring(2)] = args[i+1];
    }
  }
  console.log(commandline);
}

conf.init(commandline);



var pidFile = 'pid';

if(commandline.instance)
  pidFile += '.'+commandline.instance;



var terminate = function(status) {
  fs.unlinkSync(pidFile);
  process.exit(status);
};

process.on('SIGINT', function() {
  console.log('terminating due to SIGINT...');
  terminate(0);
});


var app = express();

// Setup server
var setupServer = function() {


	console.log("SETTING UP SERVER");
  var server;

  if(!conf.useHttps) {
	   server = require('http').createServer(app);
  }
  else {
    var httpsOpts = {
      key: fs.readFileSync(conf.ssl.keyFile),
      cert: fs.readFileSync(conf.ssl.certFile)
    };
    server = require('https').createServer(httpsOpts, app);
  }

	console.log("CONFIGURING EXPRESS");
	require('./conf/express_conf')(app);

  console.log("SETTING UP ROUTES");
	require('./routes')(app);

	// Start server
	console.log("STARTING SERVER");
	server.listen(conf.serverListen.port, conf.serverListen.host, function () {
    fs.writeFileSync(pidFile, ''+process.pid);
	  console.log('%s server listening on %s %d', (conf.useHttps ? 'HTTPS' : 'http'), (conf.serverListen.host ? conf.serverListen.host+':' : ''), conf.serverListen.port);
    if(conf.dev)
      console.log("DEV MODE");
	});

}
// Expose app
exports = module.exports = app;


//Initialize server components:
require('./api/datasource').init(conf)
  .then(
    setupServer,
    function(err){console.error("ERROR INITIALIZING DATASOURCE: %s", err); if(err.stack) console.error(err.stack); terminate(1);}
  );




