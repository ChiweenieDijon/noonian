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
var Q = require('q');
var _ = require('lodash');
var express = require('express');

var conf = require('../conf');
var wsUtil = require('./util');

var db = require('../api/datasource');
var auth = require('../api/auth');

var invokerTool = require('../tools/invoker');


var controller = {};
var wsRoot = conf.urlBase+'/ws';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.all('/*', wsUtil.wrap(controller.invokeWebservice));

  app.use(wsRoot, router);
}


controller.invokeWebservice = function(req, res) {

  db.WebService.findOne({path:req.path}).exec().then(function(wsObj){

    if(!wsObj || !wsObj['function']) {
      return wsUtil.handleError(res, req.path+' not found', 404);
    }


    //Check permissions...
    auth.checkRoles(req, wsObj.rolespec).then(
      function() {
        var injectables = {
          req:req,
          res:res,
          queryParams:req.query,
          postBody:req.body
        };

        var toCall = wsObj['function'];
        // console.log(toCall);
        invokerTool.invokeAndReturnPromise(toCall, injectables, wsObj).then(
          function(retVal) {
            if(retVal && retVal.__stream_response) {
              retVal.__stream_response.pipe(res);
            }
            else {
              if(!res.get('Content-Type')) {
                res.json(retVal);
              }
              else {
                res.send(retVal);
              }
              
            }
          },
          function(err) {
            wsUtil.handleError(res, err);
          }
        );

      },
      function(err) {
        //Role check failed... send 401 status
        wsUtil.handleError(res, err, 401);
      }
    );

  });

};

