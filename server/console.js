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
* server/console.js
*   require this in node console to access noonian objects
**/

var fs = require('fs');
var _ = require('lodash');

var conf = require('./conf');


exports.init = function(commandline) {
    conf.init(commandline);
    require('./api/datasource').init(conf).then(require('./api/schedule').init)
    .then(
      function() {
	console.log('init complete');
	exports.db = require('./api/datasource');
	
	},
      function(err){console.error("ERROR INITIALIZING DATASOURCE: %s", err); if(err.stack) console.error(err.stack); terminate(1);}
    );
}


//Initialize server components:





