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
/*
 *Package Web Service
 */
'use strict';

var Q = require('q');
var _ = require('lodash');
var express = require('express');

var conf = require('../conf');
var wsUtil = require('./util');


var db = require('../api/datasource');
var GridFsService = require('../api/datasource/gridfs');
var PackagingService = require('../api/datasource/packaging');

var controller = {};


var wsRoot = conf.urlBase+'/pkg';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.get('/createUpgrade', wsUtil.wrap(controller.createUpgrade));
  router.get('/applyPackage', wsUtil.wrap(controller.applyPackage));

  app.use(wsRoot, router);
}



/**
 *  Run against a BusinessObjectPackage record
**/
controller.createUpgrade = function(req, res) {
  var bopId = req.query.id;

  PackagingService.buildPackage(bopId).then(function(result) {
    res.json({message:'created package '+result});
  },

  wsUtil.handleError.bind(null, res)
  );
};

controller.applyPackage = function(req, res) {
  var bopId = req.query.id;

  PackagingService.applyPackage(bopId).then(function(result) {
    res.json({message:'applied package '+result});
  },

  wsUtil.handleError.bind(null, res)
  );
};


