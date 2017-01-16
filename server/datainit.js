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
* server/datainit.js
*   Process data layer init without starting the server.  usage:
*   node server/datainit.js --instance <instance name>
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


//Initialize server components:
require('./api/datasource').init(conf)
  .then(
    function() {
        console.log('Data layer init complete.  Have a nice day.');
        process.exit(0);
    },
    function(err){
        console.error("ERROR INITIALIZING DATASOURCE: %s", err); 
        if(err.stack) {
            console.error(err.stack); 
        }
        process.exit(1);
    }
  );




