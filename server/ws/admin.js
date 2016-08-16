'use strict';
var Q = require('q');
var _ = require('lodash');
var express = require('express');

var conf = require('../conf');
var wsUtil = require('./util');

var db = require('../api/datasource');
var auth = require('../api/auth');

var controller = {};


var wsRoot = conf.urlBase+'/admin';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.get('/performRepair', wsUtil.wrap(controller.performRepair));

  app.use(wsRoot, router);
}


controller.performRepair = function(req, res) {
  console.log('db/performRepair ws called');
  wsUtil.sendPromiseResult(res, db._svc.RefService.repair());
};
