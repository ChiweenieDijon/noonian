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
  config web service
  Defines the server-side logic for config api webservice endpoints
   * GET     /config/param/:key              ->  getParam
*/
'use strict';
var Q = require('q');
var _ = require('lodash');
var express = require('express');

var conf = require('../../conf');
var wsUtil = require('../util');

var db = require('../../api/datasource');
var config = require('../../api/config');

var controller = {};


var wsRoot = conf.urlBase+'/config';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.get('/param/:key', wsUtil.wrap(controller.getParam));

  app.use(wsRoot, router);
}

/**
 *
**/
controller.getParam = function(req, res) {
  var key = req.params.key;
  var skipCustomize = (req.query.user_customize === "false");

  var promise;
  if(skipCustomize || !req.user)
    promise = config.getParameter(key);
  else
    promise = config.getCustomizedParameter(key, req.user._id);

  promise.then(
    function(result) {
      if(result != undefined) {
        return res.json({result:result});
      }
      else {
        return wsUtil.handleError(res, 'Configuration item not found for key:'+key);
      }
    },
    wsUtil.handleError.bind(this, res) //Error handler for promise rejection
  );

};



