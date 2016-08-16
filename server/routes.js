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

/**
 * Main application routes
 */

'use strict';
var fs = require('fs');
var conf = require('./conf');

var configSvc = require('./api/config');

var authWs = require('./ws/auth');
var wsUtil = require('./ws/util');


var defaultRoot = 'dbui/index';

module.exports = function(app) {

  var redirectToIndex = function(req, res) {
    res.redirect(defaultRoot);
  };

  try {

    //Interceptor
    app.use('/*', authWs.getAuthInterceptor(app));



    app.use(function (err, req, res, next) {
      if (err.name === 'UnauthorizedError') {
        wsUtil.handleError(res, err);
      }
    });


    //Web services
    require('./ws/db').init(app);
    require('./ws/config').init(app);
    require('./ws/webservice').init(app);
    require('./ws/attachment').init(app);
    require('./ws/export').init(app);
    require('./ws/package').init(app);
    // require('./ws/admin').init(app);
    
    authWs.init(app);


    app.route(conf.urlBase+'/').get(redirectToIndex);

    //The webresource ws resolves any other URLs to WebResource business objects:
    require('./ws/webresource').init(app);


    configSvc.getParameter('sys.urlConfig', {}).then(function(cfg) {
      if(cfg && cfg.rootRedirect) {
        defaultRoot = cfg.rootRedirect;
      }
    });


  } catch(e) {
      console.log("ROUTE INIT FAILURE")
      console.log(e.stack);
  }
};



